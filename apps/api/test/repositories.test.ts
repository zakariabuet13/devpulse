import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { createIssue, createPullRequest, createRepository, createTeam } from "./factories";

describe("GET /teams/:teamId/repositories", () => {
  it("lists the team's repositories", async () => {
    const team = await createTeam();
    await createRepository({ teamId: team.id, githubFullName: "devpulse/api" });
    await createRepository(); // other team

    const res = await request(createApp()).get(`/teams/${team.id}/repositories`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].githubFullName).toBe("devpulse/api");
  });

  it("404s for a missing team", async () => {
    const res = await request(createApp()).get("/teams/nope/repositories");

    expect(res.status).toBe(404);
  });

  it("lists a team's repositories ordered by githubFullName ascending", async () => {
    const team = await createTeam();
    for (const githubFullName of ["org/c", "org/a", "org/b"]) {
      await createRepository({ teamId: team.id, githubFullName });
    }

    const res = await request(createApp()).get(`/teams/${team.id}/repositories`);

    expect(res.body.items.map((r: { githubFullName: string }) => r.githubFullName)).toEqual([
      "org/a",
      "org/b",
      "org/c",
    ]);
  });
});

describe("POST /teams/:teamId/repositories", () => {
  it("creates a repository", async () => {
    const team = await createTeam();

    const res = await request(createApp())
      .post(`/teams/${team.id}/repositories`)
      .send({ githubFullName: "smoke/repo-one" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ teamId: team.id, githubFullName: "smoke/repo-one" });
  });

  it("rejects an invalid name with 400", async () => {
    const team = await createTeam();

    const res = await request(createApp())
      .post(`/teams/${team.id}/repositories`)
      .send({ githubFullName: "bad" });

    expect(res.status).toBe(400);
  });

  // Regression: Prisma's `mode: "insensitive"` equals compiled to ILIKE, so `_` was a wildcard.
  it("treats _ in githubFullName literally (devpulse/ap_ is not devpulse/api)", async () => {
    const team = await createTeam();
    await createRepository({ teamId: team.id, githubFullName: "devpulse/api" });

    const res = await request(createApp())
      .post(`/teams/${team.id}/repositories`)
      .send({ githubFullName: "devpulse/ap_" });

    expect(res.status).toBe(201);
    expect(res.body.githubFullName).toBe("devpulse/ap_");
  });

  // Guard: case-insensitive uniqueness must keep working.
  it("rejects a case-differing duplicate with 409", async () => {
    const team = await createTeam();
    await createRepository({ teamId: team.id, githubFullName: "devpulse/api" });

    const res = await request(createApp())
      .post(`/teams/${team.id}/repositories`)
      .send({ githubFullName: "DEVPULSE/API" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: "CONFLICT",
      message: "githubFullName already exists",
    });
  });

  it("POST under a missing team is 404 'Team not found'", async () => {
    const res = await request(createApp())
      .post("/teams/nope/repositories")
      .send({ githubFullName: "org/repo" });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Team not found");
  });

  it.each([
    ["no owner", "repo"],
    ["owner longer than 39 chars", `${"o".repeat(40)}/repo`],
    ["empty repo part", "org/"],
  ])("POST with %s is 400", async (_label, githubFullName) => {
    const team = await createTeam();

    const res = await request(createApp())
      .post(`/teams/${team.id}/repositories`)
      .send({ githubFullName });

    expect(res.status).toBe(400);
  });
});

describe("/repositories/:id", () => {
  it("GET returns the repository", async () => {
    const repo = await createRepository();

    const res = await request(createApp()).get(`/repositories/${repo.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(repo.id);
  });

  it("PATCH moves the repository to another team", async () => {
    const repo = await createRepository();
    const target = await createTeam();

    const res = await request(createApp())
      .patch(`/repositories/${repo.id}`)
      .send({ teamId: target.id });

    expect(res.status).toBe(200);
    expect(res.body.teamId).toBe(target.id);
  });

  it("DELETE removes the repository and cascades to its issues", async () => {
    const repo = await createRepository();
    const issue = await createIssue({ repositoryId: repo.id });
    const app = createApp();

    expect((await request(app).delete(`/repositories/${repo.id}`)).status).toBe(204);
    expect((await request(app).get(`/issues/${issue.id}`)).status).toBe(404);
  });

  it("DELETE cascades to the repository's pull requests", async () => {
    const repo = await createRepository();
    const pr = await createPullRequest({ repositoryId: repo.id });
    const app = createApp();

    expect((await request(app).delete(`/repositories/${repo.id}`)).status).toBe(204);
    expect((await request(app).get(`/pull-requests/${pr.id}`)).status).toBe(404);
  });

  it("DELETE of a missing repository is 404", async () => {
    const res = await request(createApp()).delete("/repositories/nope");

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Repository not found");
  });

  it("GET of a missing repository is 404 'Repository not found'", async () => {
    const res = await request(createApp()).get("/repositories/nope");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Repository not found",
    });
  });

  it("PATCH of a missing repository is 404 'Repository not found'", async () => {
    const team = await createTeam();

    const res = await request(createApp()).patch("/repositories/nope").send({ teamId: team.id });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Repository not found");
  });

  it("PATCH moving to a missing team is 404 'Team not found' and changes nothing", async () => {
    const repo = await createRepository();

    const res = await request(createApp())
      .patch(`/repositories/${repo.id}`)
      .send({ teamId: "missing" });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Team not found");
    const row = await prisma.repository.findUnique({ where: { id: repo.id } });
    expect(row?.teamId).toBe(repo.teamId);
  });

  it("PATCH to another repository's name (any case) is 409 and changes nothing", async () => {
    await createRepository({ githubFullName: "devpulse/api" });
    const web = await createRepository({ githubFullName: "devpulse/web" });

    const res = await request(createApp())
      .patch(`/repositories/${web.id}`)
      .send({ githubFullName: "DevPulse/API" });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("githubFullName already exists");
    const row = await prisma.repository.findUnique({ where: { id: web.id } });
    expect(row?.githubFullName).toBe("devpulse/web");
  });

  it.each([
    ["empty body", {}],
    ["valid key plus unknown key", { githubFullName: "ok/repo", nmae: "x" }],
    ["empty teamId", { teamId: "" }],
  ])("PATCH with %s is 400 and changes nothing", async (_label, body) => {
    const repo = await createRepository({ githubFullName: "before/repo" });

    const res = await request(createApp()).patch(`/repositories/${repo.id}`).send(body);

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.error)).toBe(true);
    const row = await prisma.repository.findUnique({ where: { id: repo.id } });
    expect(row?.githubFullName).toBe("before/repo");
    expect(row?.teamId).toBe(repo.teamId);
  });

  it("a moved repository keeps its issues and pull requests", async () => {
    const repo = await createRepository();
    const target = await createTeam();
    await createIssue({ repositoryId: repo.id });
    await createPullRequest({ repositoryId: repo.id });
    const app = createApp();

    await request(app).patch(`/repositories/${repo.id}`).send({ teamId: target.id });

    const issues = await request(app).get(`/repositories/${repo.id}/issues`);
    const prs = await request(app).get(`/repositories/${repo.id}/pull-requests`);
    expect(issues.body.total).toBe(1);
    expect(prs.body.total).toBe(1);
    expect((await request(app).get(`/teams/${target.id}/repositories`)).body.total).toBe(1);
  });
});
