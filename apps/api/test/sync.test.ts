import { readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import {
  createIssue,
  createPullRequest,
  createRepository,
  createTeam,
} from "./factories";

// --- Fake GitHubClient built from the recorded fixtures --------------------
// Shapes follow the GitHubClient contract in docs/SPEC-github-sync.md and the
// normalized Gh* shapes in docs/PLAN-github-sync.md (section 3).

type GhRepo = { id: bigint; fullName: string };
type GhIssue = {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: string[];
  createdAt: Date;
  isPullRequest: boolean;
};
type GhPull = {
  number: number;
  title: string;
  state: "open" | "closed";
  author: string;
  mergedAt: Date | null;
};

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(join(__dirname, "fixtures", "github", name), "utf8"),
  ) as any;

const repoFx = fixture("repo.json");
const REPO_ID = BigInt(repoFx.id); // 1403106420
const REPO_NAME: string = repoFx.full_name; // zakariabuet13/devpulse

const fixtureIssues = (): GhIssue[] =>
  (fixture("issues.json") as any[]).map((i) => ({
    number: i.number,
    title: i.title,
    state: i.state,
    labels: i.labels.map((l: { name: string }) => l.name),
    createdAt: new Date(i.created_at),
    isPullRequest: i.pull_request !== undefined,
  }));

const fixturePulls = (): GhPull[] =>
  (fixture("pulls.json") as any[]).map((p) => ({
    number: p.number,
    title: p.title,
    state: p.state,
    author: p.user.login,
    mergedAt: p.merged_at ? new Date(p.merged_at) : null,
  }));

const ghRepo = (over: Partial<GhRepo> = {}): GhRepo => ({
  id: REPO_ID,
  fullName: REPO_NAME,
  ...over,
});

const issue = (number: number, over: Partial<GhIssue> = {}): GhIssue => ({
  number,
  title: `Issue ${number}`,
  state: "open",
  labels: [],
  createdAt: new Date("2025-01-01T00:00:00Z"),
  isPullRequest: false,
  ...over,
});

const pull = (number: number, over: Partial<GhPull> = {}): GhPull => ({
  number,
  title: `PR ${number}`,
  state: "open",
  author: "author",
  mergedAt: null,
  ...over,
});

// Mutable fake: tests swap `repos` / `issues` / `pulls` between syncs.
function fakeGithub(
  init: {
    repo?: GhRepo;
    issues?: GhIssue[];
    pulls?: GhPull[];
  } = {},
) {
  const state = {
    repo: init.repo ?? ghRepo(),
    issues: init.issues ?? fixtureIssues(),
    pulls: init.pulls ?? fixturePulls(),
  };
  const client = {
    getRepo: vi.fn(async (_fullName: string) => state.repo),
    getRepoById: vi.fn(async (_id: bigint) => state.repo),
    listIssues: vi.fn(async (_fullName: string) => state.issues),
    listPulls: vi.fn(async (_fullName: string) => state.pulls),
  };
  return { state, client };
}

type Fake = ReturnType<typeof fakeGithub>["client"];
const sync = (teamId: string, github: Fake) =>
  // createApp takes no args until the implementation adds `{ github }`; cast so this typechecks now.
  request(
    (createApp as (deps: { github: Fake }) => ReturnType<typeof createApp>)({
      github,
    }),
  ).post(`/teams/${teamId}/sync`);

async function teamWithRepo(fullName = REPO_NAME) {
  const team = await createTeam();
  const repo = await createRepository({
    teamId: team.id,
    githubFullName: fullName,
  });
  return { team, repo };
}

const issueNumbers = async (repositoryId: string) =>
  (await prisma.issue.findMany({ where: { repositoryId } }))
    .map((i) => i.number)
    .sort((a, b) => a - b);

const prNumbers = async (repositoryId: string) =>
  (await prisma.pullRequest.findMany({ where: { repositoryId } }))
    .map((p) => p.number)
    .sort((a, b) => a - b);

describe("POST /teams/:teamId/sync", () => {
  it("404s for an unknown team with 'Team not found'", async () => {
    const { client } = fakeGithub();

    const res = await sync("nope", client);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Team not found",
    });
    expect(client.getRepo).not.toHaveBeenCalled();
  });

  it("returns empty results for a team without repositories", async () => {
    const team = await createTeam();
    const { client } = fakeGithub();

    const res = await sync(team.id, client);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ repositories: [], skipped: [], errors: [] });
    expect(client.getRepo).not.toHaveBeenCalled();
  });

  describe("first sync", () => {
    it("looks the repo up by name, reports counts and the id as a decimal string", async () => {
      const { team, repo } = await teamWithRepo();
      const { client } = fakeGithub();

      const res = await sync(team.id, client);

      expect(res.status).toBe(200);
      expect(client.getRepo).toHaveBeenCalledWith(REPO_NAME);
      expect(client.getRepoById).not.toHaveBeenCalled();
      expect(res.body.skipped).toEqual([]);
      expect(res.body.errors).toEqual([]);
      expect(res.body.repositories).toEqual([
        {
          repositoryId: repo.id,
          githubFullName: REPO_NAME,
          githubId: "1403106420",
          issues: { created: 3, updated: 0, deleted: 0 },
          pullRequests: { created: 10, updated: 0 },
        },
      ]);
    });

    it("saves only real issues (items flagged as pull requests are skipped)", async () => {
      const { team, repo } = await teamWithRepo();
      const { client } = fakeGithub();

      await sync(team.id, client);

      expect(await issueNumbers(repo.id)).toEqual([11, 12, 13]);
      expect(await prNumbers(repo.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it("maps issue fields: state, label names, created_at", async () => {
      const { team, repo } = await teamWithRepo();
      const { client } = fakeGithub({
        issues: [
          issue(1, {
            title: "open one",
            state: "open",
            labels: ["bug", "ui"],
            createdAt: new Date("2025-03-04T05:06:07Z"),
          }),
          issue(2, { state: "closed" }),
        ],
        pulls: [],
      });

      await sync(team.id, client);

      const rows = await prisma.issue.findMany({
        where: { repositoryId: repo.id },
        orderBy: { number: "asc" },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        number: 1,
        title: "open one",
        state: "OPEN",
        labels: ["bug", "ui"],
      });
      expect(rows[0].githubCreatedAt.toISOString()).toBe(
        "2025-03-04T05:06:07.000Z",
      );
      expect(rows[1].state).toBe("CLOSED");
    });

    it("maps PR state: merged_at set -> MERGED, closed -> CLOSED, open -> OPEN", async () => {
      const { team, repo } = await teamWithRepo();
      const merged = new Date("2025-02-02T10:00:00Z");
      const { client } = fakeGithub({
        issues: [],
        pulls: [
          // GitHub reports merged PRs as state "closed" with merged_at set.
          pull(1, { state: "closed", mergedAt: merged, author: "alice" }),
          pull(2, { state: "closed", mergedAt: null }),
          pull(3, { state: "open", mergedAt: null }),
        ],
      });

      await sync(team.id, client);

      const rows = await prisma.pullRequest.findMany({
        where: { repositoryId: repo.id },
        orderBy: { number: "asc" },
      });
      expect(rows.map((r) => r.state)).toEqual(["MERGED", "CLOSED", "OPEN"]);
      expect(rows[0].author).toBe("alice");
      expect(rows[0].mergedAt?.toISOString()).toBe(merged.toISOString());
      expect(rows[1].mergedAt).toBeNull();
      expect(rows[2].mergedAt).toBeNull();
    });

    it("marks every fixture PR MERGED", async () => {
      const { team, repo } = await teamWithRepo();
      const { client } = fakeGithub();

      await sync(team.id, client);

      const rows = await prisma.pullRequest.findMany({
        where: { repositoryId: repo.id },
      });
      expect(rows).toHaveLength(10);
      expect(rows.every((r) => r.state === "MERGED" && r.mergedAt)).toBe(true);
    });

    it("serializes ids above int32 (BigInt) without throwing", async () => {
      const { team } = await teamWithRepo();
      const { client } = fakeGithub({
        repo: ghRepo({ id: 5_000_000_000n }),
        issues: [],
        pulls: [],
      });

      const res = await sync(team.id, client);

      expect(res.status).toBe(200);
      expect(res.body.repositories[0].githubId).toBe("5000000000");
    });

    it("only syncs the given team's repositories, in githubFullName order", async () => {
      const team = await createTeam();
      const b = await createRepository({
        teamId: team.id,
        githubFullName: "org/b",
      });
      const a = await createRepository({
        teamId: team.id,
        githubFullName: "org/a",
      });
      const other = await createRepository({ githubFullName: "other/x" });
      const { client } = fakeGithub();
      let id = 100n;
      client.getRepo.mockImplementation(async (fullName: string) => ({
        id: id++,
        fullName,
      }));

      const res = await sync(team.id, client);

      expect(res.status).toBe(200);
      expect(
        res.body.repositories.map(
          (r: { repositoryId: string }) => r.repositoryId,
        ),
      ).toEqual([a.id, b.id]);
      expect(client.getRepo).toHaveBeenCalledTimes(2);
      expect(client.getRepo).not.toHaveBeenCalledWith("other/x");
      expect(await issueNumbers(other.id)).toEqual([]);
    });
  });

  describe("later syncs", () => {
    it("look the repo up by stored id, not by name", async () => {
      const { team } = await teamWithRepo();
      const { client } = fakeGithub();
      await sync(team.id, client);
      client.getRepo.mockClear();

      const res = await sync(team.id, client);

      expect(res.status).toBe(200);
      expect(client.getRepoById).toHaveBeenCalledTimes(1);
      expect(client.getRepoById).toHaveBeenCalledWith(REPO_ID);
      expect(client.getRepo).not.toHaveBeenCalled();
    });

    it("update githubFullName when the repo was renamed on GitHub", async () => {
      const { team, repo } = await teamWithRepo();
      const fake = fakeGithub();
      await sync(team.id, fake.client);
      fake.state.repo = ghRepo({ fullName: "newowner/renamed" });

      const res = await sync(team.id, fake.client);

      expect(res.status).toBe(200);
      expect(res.body.repositories[0]).toMatchObject({
        repositoryId: repo.id,
        githubFullName: "newowner/renamed",
        githubId: "1403106420",
      });
      const row = await prisma.repository.findUniqueOrThrow({
        where: { id: repo.id },
      });
      expect(row.githubFullName).toBe("newowner/renamed");
      // Issues/PRs are fetched under the new name.
      expect(fake.client.listIssues).toHaveBeenLastCalledWith(
        "newowner/renamed",
      );
      expect(fake.client.listPulls).toHaveBeenLastCalledWith(
        "newowner/renamed",
      );
    });

    it("are idempotent: same rows, created 0 and updated N", async () => {
      const { team, repo } = await teamWithRepo();
      const { client } = fakeGithub();
      await sync(team.id, client);
      const issuesBefore = await prisma.issue.findMany({
        where: { repositoryId: repo.id },
        orderBy: { number: "asc" },
      });
      const prsBefore = await prisma.pullRequest.findMany({
        where: { repositoryId: repo.id },
        orderBy: { number: "asc" },
      });

      const res = await sync(team.id, client);

      expect(res.status).toBe(200);
      expect(res.body.repositories[0].issues).toEqual({
        created: 0,
        updated: 3,
        deleted: 0,
      });
      expect(res.body.repositories[0].pullRequests).toEqual({
        created: 0,
        updated: 10,
      });
      const issuesAfter = await prisma.issue.findMany({
        where: { repositoryId: repo.id },
        orderBy: { number: "asc" },
      });
      const prsAfter = await prisma.pullRequest.findMany({
        where: { repositoryId: repo.id },
        orderBy: { number: "asc" },
      });
      expect(issuesAfter.map((i) => i.id)).toEqual(
        issuesBefore.map((i) => i.id),
      );
      expect(prsAfter.map((p) => p.id)).toEqual(prsBefore.map((p) => p.id));
    });

    it("update changed fields on existing rows and count created vs updated", async () => {
      const { team, repo } = await teamWithRepo();
      const fake = fakeGithub({
        issues: [issue(1, { title: "old", state: "open" })],
        pulls: [pull(1, { state: "open" })],
      });
      await sync(team.id, fake.client);
      fake.state.issues = [
        issue(1, { title: "new", state: "closed" }),
        issue(2),
      ];
      fake.state.pulls = [
        pull(1, {
          state: "closed",
          mergedAt: new Date("2025-05-05T00:00:00Z"),
        }),
        pull(2),
      ];

      const res = await sync(team.id, fake.client);

      expect(res.body.repositories[0].issues).toMatchObject({
        created: 1,
        updated: 1,
      });
      expect(res.body.repositories[0].pullRequests).toEqual({
        created: 1,
        updated: 1,
      });
      const i1 = await prisma.issue.findFirstOrThrow({
        where: { repositoryId: repo.id, number: 1 },
      });
      expect(i1).toMatchObject({ title: "new", state: "CLOSED" });
      const p1 = await prisma.pullRequest.findFirstOrThrow({
        where: { repositoryId: repo.id, number: 1 },
      });
      expect(p1.state).toBe("MERGED");
    });

    it("delete issues that no longer exist on GitHub and report them", async () => {
      const { team, repo } = await teamWithRepo();
      const fake = fakeGithub({
        issues: [issue(1), issue(2), issue(3)],
        pulls: [],
      });
      await sync(team.id, fake.client);
      fake.state.issues = [issue(1), issue(3)];

      const res = await sync(team.id, fake.client);

      expect(res.body.repositories[0].issues).toEqual({
        created: 0,
        updated: 2,
        deleted: 1,
      });
      expect(await issueNumbers(repo.id)).toEqual([1, 3]);
    });

    it("do not delete issues of other repositories", async () => {
      const { team, repo } = await teamWithRepo();
      const otherIssue = await createIssue({ number: 1 }); // own repo/team
      const fake = fakeGithub({ issues: [issue(1)], pulls: [] });
      await sync(team.id, fake.client);
      expect(await issueNumbers(repo.id)).toEqual([1]);
      fake.state.issues = [];

      await sync(team.id, fake.client);

      expect(await issueNumbers(repo.id)).toEqual([]);
      expect(
        await prisma.issue.findUnique({ where: { id: otherIssue.id } }),
      ).not.toBeNull();
    });

    it("keep local-only fields (issue priority/aiSummary, PR reviewRequestedAt)", async () => {
      const { team, repo } = await teamWithRepo();
      const fake = fakeGithub({ issues: [issue(1)], pulls: [pull(1)] });
      await sync(team.id, fake.client);
      const reviewAt = new Date("2025-06-06T06:06:06Z");
      await prisma.issue.updateMany({
        where: { repositoryId: repo.id, number: 1 },
        data: { priority: "URGENT", aiSummary: "local summary" },
      });
      await prisma.pullRequest.updateMany({
        where: { repositoryId: repo.id, number: 1 },
        data: { reviewRequestedAt: reviewAt },
      });
      fake.state.issues = [issue(1, { title: "retitled" })];
      fake.state.pulls = [pull(1, { title: "retitled pr" })];

      await sync(team.id, fake.client);

      const i = await prisma.issue.findFirstOrThrow({
        where: { repositoryId: repo.id, number: 1 },
      });
      expect(i).toMatchObject({
        title: "retitled",
        priority: "URGENT",
        aiSummary: "local summary",
      });
      const p = await prisma.pullRequest.findFirstOrThrow({
        where: { repositoryId: repo.id, number: 1 },
      });
      expect(p.title).toBe("retitled pr");
      expect(p.reviewRequestedAt?.toISOString()).toBe(reviewAt.toISOString());
    });

    it("leave existing PRs alone when they vanish from GitHub", async () => {
      const { team, repo } = await teamWithRepo();
      const pr = await createPullRequest({ repositoryId: repo.id, number: 99 });
      const fake = fakeGithub({ issues: [], pulls: [pull(1)] });

      await sync(team.id, fake.client);

      expect(await prNumbers(repo.id)).toEqual([1, 99]);
      expect(
        await prisma.pullRequest.findUnique({ where: { id: pr.id } }),
      ).not.toBeNull();
    });
  });

  describe("GitHub failures", () => {
    it("skips a repo GitHub answers 404 for and reports it", async () => {
      // The 404 signal is GitHubNotFoundError from src/github/types (PLAN section 3).
      // Path held in a variable so tsc doesn't resolve the not-yet-existing module.
      const typesPath = "../src/github/types";
      const { GitHubNotFoundError } = await import(typesPath);
      const team = await createTeam();
      const gone = await createRepository({
        teamId: team.id,
        githubFullName: "org/gone",
      });
      const ok = await createRepository({
        teamId: team.id,
        githubFullName: "org/ok",
      });
      const { client } = fakeGithub({ issues: [issue(1)], pulls: [] });
      client.getRepo.mockImplementation(async (fullName: string) => {
        if (fullName === "org/gone") throw new GitHubNotFoundError();
        return { id: 777n, fullName };
      });

      const res = await sync(team.id, client);

      expect(res.status).toBe(200);
      expect(res.body.skipped).toEqual([
        {
          repositoryId: gone.id,
          githubFullName: "org/gone",
          reason: "NOT_FOUND",
        },
      ]);
      expect(res.body.errors).toEqual([]);
      expect(res.body.repositories).toHaveLength(1);
      expect(res.body.repositories[0].repositoryId).toBe(ok.id);
      expect(await issueNumbers(ok.id)).toEqual([1]);
      expect(await issueNumbers(gone.id)).toEqual([]);
    });

    it("reports other errors per repo with a generic message and keeps syncing", async () => {
      const team = await createTeam();
      const bad = await createRepository({
        teamId: team.id,
        githubFullName: "org/a-bad",
      });
      const ok = await createRepository({
        teamId: team.id,
        githubFullName: "org/b-ok",
      });
      const { client } = fakeGithub({ issues: [issue(1)], pulls: [] });
      const secret = "ghp_SECRET_TOKEN_VALUE upstream body text";
      client.getRepo.mockImplementation(async (fullName: string) => {
        if (fullName === "org/a-bad") throw new Error(secret);
        return { id: 888n, fullName };
      });

      const res = await sync(team.id, client);

      expect(res.status).toBe(200);
      expect(res.body.skipped).toEqual([]);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0]).toMatchObject({
        repositoryId: bad.id,
        githubFullName: "org/a-bad",
      });
      expect(typeof res.body.errors[0].message).toBe("string");
      expect(JSON.stringify(res.body)).not.toContain("ghp_SECRET_TOKEN_VALUE");
      expect(JSON.stringify(res.body)).not.toContain("upstream body text");
      expect(
        res.body.repositories.map(
          (r: { repositoryId: string }) => r.repositoryId,
        ),
      ).toEqual([ok.id]);
      expect(await issueNumbers(ok.id)).toEqual([1]);
    });

    it("never deletes or changes data when fetching issues fails mid-sync", async () => {
      const { team, repo } = await teamWithRepo();
      const fake = fakeGithub({
        issues: [issue(1), issue(2)],
        pulls: [pull(1)],
      });
      await sync(team.id, fake.client);
      fake.client.listIssues.mockRejectedValueOnce(new Error("boom"));

      const res = await sync(team.id, fake.client);

      expect(res.status).toBe(200);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0].repositoryId).toBe(repo.id);
      expect(res.body.repositories).toEqual([]);
      expect(await issueNumbers(repo.id)).toEqual([1, 2]);
    });
  });
});
