import request from "supertest";
import { describe, expect, it } from "vitest";
import { issuePageSchema } from "@devpulse/shared";
import { createApp } from "../src/app";
import { createIssue, createRepository, createTeam } from "./factories";

const get = (teamId: string, qs = "") =>
  request(createApp()).get(`/teams/${teamId}/issues${qs}`);

const titles = (body: { items: { title: string }[] }) =>
  body.items.map((i) => i.title).sort();

describe("GET /teams/:teamId/issues", () => {
  it("returns a Page<Issue> of issues across the team's repositories", async () => {
    const team = await createTeam();
    const a = await createRepository({ teamId: team.id });
    const b = await createRepository({ teamId: team.id });
    await createIssue({ repositoryId: a.id, title: "in a" });
    await createIssue({ repositoryId: b.id, title: "in b" });

    const res = await get(team.id);

    expect(res.status).toBe(200);
    const page = issuePageSchema.parse(res.body);
    expect(page).toMatchObject({ total: 2, limit: 20, offset: 0 });
    expect(titles(res.body)).toEqual(["in a", "in b"]);
  });

  it("never returns another team's issues, even when they match q", async () => {
    const team = await createTeam();
    const mine = await createRepository({ teamId: team.id });
    const theirs = await createRepository(); // other team
    await createIssue({ repositoryId: mine.id, title: "login bug" });
    await createIssue({ repositoryId: theirs.id, title: "login crash" });

    const all = await get(team.id);
    const searched = await get(team.id, "?q=login");

    expect(all.body.total).toBe(1);
    expect(searched.body.total).toBe(1);
    expect(titles(searched.body)).toEqual(["login bug"]);
  });

  it("returns an empty page for a team without issues", async () => {
    const team = await createTeam();

    const res = await get(team.id);

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  describe("q", () => {
    it("matches a case-insensitive substring of the title", async () => {
      const team = await createTeam();
      const repo = await createRepository({ teamId: team.id });
      await createIssue({ repositoryId: repo.id, title: "Fix LOGIN redirect" });
      await createIssue({ repositoryId: repo.id, title: "Relogin loop" });
      await createIssue({ repositoryId: repo.id, title: "Unrelated" });

      const res = await get(team.id, "?q=LoGiN");

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(titles(res.body)).toEqual(["Fix LOGIN redirect", "Relogin loop"]);
    });

    it("trims surrounding whitespace", async () => {
      const team = await createTeam();
      const repo = await createRepository({ teamId: team.id });
      await createIssue({ repositoryId: repo.id, title: "alpha" });
      await createIssue({ repositoryId: repo.id, title: "beta" });

      const res = await get(team.id, "?q=%20%20alpha%20%20");

      expect(res.status).toBe(200);
      expect(titles(res.body)).toEqual(["alpha"]);
    });

    it("does not search the description-less fields (label text is not matched)", async () => {
      const team = await createTeam();
      const repo = await createRepository({ teamId: team.id });
      await createIssue({
        repositoryId: repo.id,
        title: "plain",
        labels: ["needle"],
      });

      const res = await get(team.id, "?q=needle");

      expect(res.body.total).toBe(0);
    });

    it.each([
      ["%", "100%", ["100% done"]],
      ["_", "a_b", ["a_b"]],
    ])("treats %s as a literal character", async (_char, q, expected) => {
      const team = await createTeam();
      const repo = await createRepository({ teamId: team.id });
      for (const title of ["100% done", "1000 done", "a_b", "axb", "ab"]) {
        await createIssue({ repositoryId: repo.id, title });
      }

      const res = await get(team.id, `?q=${encodeURIComponent(q)}`);

      expect(res.status).toBe(200);
      expect(titles(res.body)).toEqual(expected);
    });

    it("a lone % or _ matches only titles containing it", async () => {
      const team = await createTeam();
      const repo = await createRepository({ teamId: team.id });
      await createIssue({ repositoryId: repo.id, title: "plain" });
      await createIssue({ repositoryId: repo.id, title: "50% off" });

      const res = await get(team.id, "?q=%25");

      expect(titles(res.body)).toEqual(["50% off"]);
    });

    it("returns nothing when no title matches", async () => {
      const team = await createTeam();
      const repo = await createRepository({ teamId: team.id });
      await createIssue({ repositoryId: repo.id, title: "something" });

      const res = await get(team.id, "?q=zzz");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ items: [], total: 0 });
    });

    it("accepts a 1-char and a 100-char q", async () => {
      const team = await createTeam();
      const repo = await createRepository({ teamId: team.id });
      const long = "a".repeat(100);
      await createIssue({ repositoryId: repo.id, title: long });

      const one = await get(team.id, "?q=a");
      const hundred = await get(team.id, `?q=${long}`);

      expect(one.status).toBe(200);
      expect(hundred.status).toBe(200);
      expect(hundred.body.total).toBe(1);
    });

    it.each([
      ["empty", "q="],
      ["whitespace only", "q=%20%20%20"],
      ["101 chars", `q=${"a".repeat(101)}`],
    ])("rejects q that is %s with a ZodIssue[] body", async (_l, qs) => {
      const team = await createTeam();

      const res = await get(team.id, `?${qs}`);

      expect(res.status).toBe(400);
      expect(Array.isArray(res.body.error)).toBe(true);
    });
  });

  describe("existing issue list query", () => {
    it("combines q with state, priority and label inside the team", async () => {
      const team = await createTeam();
      const repo = await createRepository({ teamId: team.id });
      const other = await createRepository();
      // Annotated (not `as const`): const makes labels a readonly tuple, which Prisma's string[] rejects.
      const base: Parameters<typeof createIssue>[0] = {
        title: "crash on save",
        state: "OPEN",
        priority: "HIGH",
        labels: ["bug"],
      };
      await createIssue({ ...base, repositoryId: repo.id });
      await createIssue({ ...base, repositoryId: repo.id, state: "CLOSED" });
      await createIssue({ ...base, repositoryId: repo.id, priority: "LOW" });
      await createIssue({ ...base, repositoryId: repo.id, labels: ["docs"] });
      await createIssue({ ...base, repositoryId: other.id });

      const res = await get(
        team.id,
        "?q=CRASH&state=OPEN&priority=HIGH,URGENT&label=bug",
      );

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
    });

    it("sorts by number asc and defaults to githubCreatedAt desc", async () => {
      const team = await createTeam();
      const repo = await createRepository({ teamId: team.id });
      const d = (day: string) => new Date(`2024-01-${day}T00:00:00Z`);
      await createIssue({
        repositoryId: repo.id,
        number: 1,
        githubCreatedAt: d("02"),
      });
      await createIssue({
        repositoryId: repo.id,
        number: 2,
        githubCreatedAt: d("03"),
      });
      await createIssue({
        repositoryId: repo.id,
        number: 3,
        githubCreatedAt: d("01"),
      });
      const numbers = async (qs: string) =>
        (await get(team.id, qs)).body.items.map(
          (i: { number: number }) => i.number,
        );

      expect(await numbers("")).toEqual([2, 1, 3]);
      expect(await numbers("?sort=number&order=asc")).toEqual([1, 2, 3]);
    });

    it("pages tied sort keys by id asc without gaps or repeats", async () => {
      const team = await createTeam();
      const repo = await createRepository({ teamId: team.id });
      const same = new Date("2024-01-01T00:00:00Z");
      for (let i = 1; i <= 5; i++) {
        await createIssue({
          repositoryId: repo.id,
          number: i,
          title: `tie ${i}`,
          githubCreatedAt: same,
        });
      }

      const ids: string[] = [];
      for (const offset of [0, 2, 4]) {
        const res = await get(team.id, `?q=tie&limit=2&offset=${offset}`);
        expect(res.body.total).toBe(5);
        expect(res.body).toMatchObject({ limit: 2, offset });
        ids.push(...res.body.items.map((i: { id: string }) => i.id));
      }

      expect(new Set(ids).size).toBe(5);
      expect(ids).toEqual([...ids].sort());
    });

    it.each([
      ["sort=bogus"],
      ["order=sideways"],
      ["state=BOGUS"],
      ["priority=NOPE"],
      ["limit=0"],
      ["limit=101"],
      ["offset=-1"],
    ])("rejects ?%s with a ZodIssue[] body", async (qs) => {
      const team = await createTeam();

      const res = await get(team.id, `?${qs}`);

      expect(res.status).toBe(400);
      expect(Array.isArray(res.body.error)).toBe(true);
    });
  });

  it("404s for an unknown team with 'Team not found'", async () => {
    const res = await get("nope");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Team not found",
    });
  });
});
