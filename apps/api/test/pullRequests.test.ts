import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createPullRequest, createRepository } from "./factories";

describe("GET /repositories/:id/pull-requests", () => {
  it("lists the repository's pull requests", async () => {
    const repo = await createRepository();
    await createPullRequest({ repositoryId: repo.id });
    await createPullRequest(); // other repo

    const res = await request(createApp()).get(`/repositories/${repo.id}/pull-requests`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  it("filters by state=MERGED", async () => {
    const repo = await createRepository();
    await createPullRequest({ repositoryId: repo.id, state: "OPEN" });
    await createPullRequest({ repositoryId: repo.id, state: "CLOSED" });
    await createPullRequest({ repositoryId: repo.id, state: "MERGED", mergedAt: new Date() });

    const res = await request(createApp()).get(
      `/repositories/${repo.id}/pull-requests?state=MERGED`,
    );

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].state).toBe("MERGED");
    expect(res.body.items[0].mergedAt).not.toBeNull();
  });
});

describe("/pull-requests/:id", () => {
  it("GET returns the pull request", async () => {
    const pr = await createPullRequest();

    const res = await request(createApp()).get(`/pull-requests/${pr.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(pr.id);
  });

  it("PATCH has no route (404)", async () => {
    const pr = await createPullRequest();

    const res = await request(createApp()).patch(`/pull-requests/${pr.id}`).send({ title: "x" });

    expect(res.status).toBe(404);
  });

  it("GET of a missing pull request is 404 'Pull request not found'", async () => {
    const res = await request(createApp()).get("/pull-requests/nope");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Pull request not found",
    });
  });

  it.each(["post", "delete"] as const)("%s /pull-requests has no route (404)", async (method) => {
    const pr = await createPullRequest();
    const app = createApp();

    expect((await request(app)[method]("/pull-requests")).status).toBe(404);
    expect((await request(app)[method](`/pull-requests/${pr.id}`)).status).toBe(404);
  });
});

describe("pull request list: ordering, filtering, validation", () => {
  const d = (day: string) => new Date(`2024-01-${day}T00:00:00Z`);

  async function seedThree() {
    const repo = await createRepository();
    await createPullRequest({ repositoryId: repo.id, number: 1, state: "MERGED", mergedAt: d("03"), reviewRequestedAt: null });
    await createPullRequest({ repositoryId: repo.id, number: 2, state: "OPEN", mergedAt: null, reviewRequestedAt: d("01") });
    await createPullRequest({ repositoryId: repo.id, number: 3, state: "MERGED", mergedAt: d("01"), reviewRequestedAt: d("02") });
    return repo;
  }

  it("defaults to number descending and supports every sort/order with nulls last", async () => {
    const repo = await seedThree();
    const app = createApp();
    const numbers = async (qs: string) =>
      (await request(app).get(`/repositories/${repo.id}/pull-requests${qs}`)).body.items.map(
        (p: { number: number }) => p.number,
      );

    expect(await numbers("")).toEqual([3, 2, 1]);
    expect(await numbers("?sort=number&order=asc")).toEqual([1, 2, 3]);
    expect(await numbers("?sort=mergedAt&order=asc")).toEqual([3, 1, 2]);
    expect(await numbers("?sort=mergedAt&order=desc")).toEqual([1, 3, 2]);
    expect(await numbers("?sort=reviewRequestedAt&order=asc")).toEqual([2, 3, 1]);
    expect(await numbers("?sort=reviewRequestedAt&order=desc")).toEqual([3, 2, 1]);
  });

  it("accepts multiple states and only returns the requested repository's PRs", async () => {
    const repo = await seedThree();
    await createPullRequest({ state: "OPEN" }); // other repository

    const res = await request(createApp()).get(
      `/repositories/${repo.id}/pull-requests?state=OPEN,MERGED`,
    );

    expect(res.body.total).toBe(3);
  });

  it("pages through rows with tied sort keys without gaps or repeats", async () => {
    const repo = await createRepository();
    const same = d("01");
    for (let i = 1; i <= 5; i++) {
      await createPullRequest({ repositoryId: repo.id, number: i, mergedAt: same });
    }
    const app = createApp();

    const ids: string[] = [];
    for (const offset of [0, 2, 4]) {
      const res = await request(app).get(
        `/repositories/${repo.id}/pull-requests?sort=mergedAt&limit=2&offset=${offset}`,
      );
      expect(res.body.total).toBe(5);
      ids.push(...res.body.items.map((p: { id: string }) => p.id));
    }

    expect(new Set(ids).size).toBe(5);
  });

  it.each([["sort=bogus"], ["order=sideways"], ["state=BOGUS"], ["state="], ["limit=0"], ["offset=-1"]])(
    "rejects ?%s with a ZodIssue[] body",
    async (qs) => {
      const repo = await createRepository();

      const res = await request(createApp()).get(`/repositories/${repo.id}/pull-requests?${qs}`);

      expect(res.status).toBe(400);
      expect(Array.isArray(res.body.error)).toBe(true);
    },
  );

  it("404s for a missing repository with 'Repository not found'", async () => {
    const res = await request(createApp()).get("/repositories/nope/pull-requests");

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Repository not found");
  });
});
