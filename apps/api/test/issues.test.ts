import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { createIssue, createRepository } from "./factories";

describe("GET /repositories/:id/issues", () => {
  it("filters by state", async () => {
    const repo = await createRepository();
    await createIssue({ repositoryId: repo.id, state: "OPEN" });
    await createIssue({ repositoryId: repo.id, state: "CLOSED" });

    const res = await request(createApp()).get(`/repositories/${repo.id}/issues?state=OPEN`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items.every((i: { state: string }) => i.state === "OPEN")).toBe(true);
  });

  it("filters by a comma-separated priority list", async () => {
    const repo = await createRepository();
    for (const priority of ["LOW", "MEDIUM", "HIGH", "URGENT"] as const) {
      await createIssue({ repositoryId: repo.id, priority });
    }

    const res = await request(createApp()).get(
      `/repositories/${repo.id}/issues?priority=HIGH,URGENT`,
    );

    expect(res.status).toBe(200);
    const priorities = res.body.items.map((i: { priority: string }) => i.priority).sort();
    expect(priorities).toEqual(["HIGH", "URGENT"]);
  });

  it("filters by label", async () => {
    const repo = await createRepository();
    await createIssue({ repositoryId: repo.id, labels: ["bug"] });
    await createIssue({ repositoryId: repo.id, labels: ["performance", "bug"] });
    await createIssue({ repositoryId: repo.id, labels: ["docs"] });

    const res = await request(createApp()).get(`/repositories/${repo.id}/issues?label=bug`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
  });

  it("sorts by priority ascending (LOW first)", async () => {
    const repo = await createRepository();
    for (const priority of ["URGENT", "LOW", "HIGH", "MEDIUM"] as const) {
      await createIssue({ repositoryId: repo.id, priority });
    }

    const res = await request(createApp()).get(
      `/repositories/${repo.id}/issues?sort=priority&order=asc`,
    );

    expect(res.status).toBe(200);
    expect(res.body.items[0].priority).toBe("LOW");
  });

  it("pages without overlap", async () => {
    const repo = await createRepository();
    for (let i = 0; i < 5; i++) await createIssue({ repositoryId: repo.id });
    const app = createApp();

    const p0 = await request(app).get(`/repositories/${repo.id}/issues?limit=2&offset=0`);
    const p1 = await request(app).get(`/repositories/${repo.id}/issues?limit=2&offset=2`);

    expect(p0.status).toBe(200);
    expect(p1.status).toBe(200);
    const ids = [...p0.body.items, ...p1.body.items].map((i: { id: string }) => i.id);
    expect(new Set(ids).size).toBe(4);
  });

  it("rejects an invalid state with 400", async () => {
    const repo = await createRepository();

    const res = await request(createApp()).get(`/repositories/${repo.id}/issues?state=BOGUS`);

    expect(res.status).toBe(400);
  });

  it("404s for a missing repository", async () => {
    const res = await request(createApp()).get("/repositories/nope/issues");

    expect(res.status).toBe(404);
  });
});

describe("/issues/:id", () => {
  it("PATCH updates priority and GET reflects it", async () => {
    const issue = await createIssue({ priority: "HIGH" });
    const app = createApp();

    const patched = await request(app).patch(`/issues/${issue.id}`).send({ priority: "LOW" });
    const fetched = await request(app).get(`/issues/${issue.id}`);

    expect(patched.status).toBe(200);
    expect(patched.body.priority).toBe("LOW");
    expect(fetched.status).toBe(200);
    expect(fetched.body.priority).toBe("LOW");
  });

  it.each([
    ["non-writable field", { title: "x" }],
    ["invalid priority", { priority: "NOPE" }],
  ])("PATCH with %s is 400", async (_label, body) => {
    const issue = await createIssue();

    const res = await request(createApp()).patch(`/issues/${issue.id}`).send(body);

    expect(res.status).toBe(400);
  });

  it("PATCH with a valid priority plus another key is rejected and nothing changes", async () => {
    const issue = await createIssue({ priority: "HIGH", title: "before" });

    const res = await request(createApp())
      .patch(`/issues/${issue.id}`)
      .send({ priority: "LOW", title: "x" });

    expect(res.status).toBe(400);
    const row = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(row).toMatchObject({ priority: "HIGH", title: "before" });
  });

  it.each([
    ["empty body", {}],
    ["labels", { labels: ["x"] }],
    ["state", { state: "CLOSED" }],
    ["aiSummary", { aiSummary: "x" }],
  ])("PATCH with %s is 400", async (_label, body) => {
    const issue = await createIssue();

    const res = await request(createApp()).patch(`/issues/${issue.id}`).send(body);

    expect(res.status).toBe(400);
  });

  it("PATCH persists the priority", async () => {
    const issue = await createIssue({ priority: "HIGH" });

    await request(createApp()).patch(`/issues/${issue.id}`).send({ priority: "URGENT" });

    expect((await prisma.issue.findUnique({ where: { id: issue.id } }))?.priority).toBe("URGENT");
  });

  it("GET / PATCH of a missing issue is 404 'Issue not found'", async () => {
    const app = createApp();

    const get = await request(app).get("/issues/nope");
    const patch = await request(app).patch("/issues/nope").send({ priority: "LOW" });

    for (const res of [get, patch]) {
      expect(res.status).toBe(404);
      expect(res.body.error).toMatchObject({ code: "NOT_FOUND", message: "Issue not found" });
    }
  });

  it.each(["post", "delete"] as const)("%s /issues has no route (404)", async (method) => {
    const issue = await createIssue();
    const app = createApp();

    expect((await request(app)[method]("/issues")).status).toBe(404);
    expect((await request(app)[method](`/issues/${issue.id}`)).status).toBe(404);
  });
});

describe("issue list: scoping, ordering, paging, validation", () => {
  const d = (day: string) => new Date(`2024-01-${day}T00:00:00Z`);

  it("only returns the requested repository's issues", async () => {
    const repo = await createRepository();
    await createIssue({ repositoryId: repo.id });
    await createIssue(); // other repository

    const res = await request(createApp()).get(`/repositories/${repo.id}/issues`);

    expect(res.body.total).toBe(1);
    expect(res.body.items[0].repositoryId).toBe(repo.id);
  });

  it("filters only within the requested repository", async () => {
    const repo = await createRepository();
    await createIssue({ repositoryId: repo.id, state: "OPEN", labels: ["bug"], priority: "HIGH" });
    const other = await createRepository();
    await createIssue({ repositoryId: other.id, state: "OPEN", labels: ["bug"], priority: "HIGH" });

    const res = await request(createApp()).get(
      `/repositories/${repo.id}/issues?state=OPEN&label=bug&priority=HIGH`,
    );

    expect(res.body.total).toBe(1);
  });

  it("accepts multiple states", async () => {
    const repo = await createRepository();
    await createIssue({ repositoryId: repo.id, state: "OPEN" });
    await createIssue({ repositoryId: repo.id, state: "CLOSED" });

    const res = await request(createApp()).get(
      `/repositories/${repo.id}/issues?state=OPEN,CLOSED`,
    );

    expect(res.body.total).toBe(2);
  });

  it("defaults to githubCreatedAt descending and supports every sort/order", async () => {
    const repo = await createRepository();
    await createIssue({ repositoryId: repo.id, number: 1, githubCreatedAt: d("02"), priority: "LOW" });
    await createIssue({ repositoryId: repo.id, number: 2, githubCreatedAt: d("03"), priority: "URGENT" });
    await createIssue({ repositoryId: repo.id, number: 3, githubCreatedAt: d("01"), priority: "MEDIUM" });
    const app = createApp();
    const numbers = async (qs: string) =>
      (await request(app).get(`/repositories/${repo.id}/issues${qs}`)).body.items.map(
        (i: { number: number }) => i.number,
      );

    expect(await numbers("")).toEqual([2, 1, 3]);
    expect(await numbers("?sort=githubCreatedAt&order=asc")).toEqual([3, 1, 2]);
    expect(await numbers("?sort=number&order=asc")).toEqual([1, 2, 3]);
    expect(await numbers("?sort=number")).toEqual([3, 2, 1]);
    expect(await numbers("?sort=priority&order=asc")).toEqual([1, 3, 2]);
    expect(await numbers("?sort=priority&order=desc")).toEqual([2, 3, 1]);
  });

  it("pages through rows with tied sort keys without gaps or repeats", async () => {
    const repo = await createRepository();
    const same = d("01");
    for (let i = 1; i <= 5; i++) {
      await createIssue({ repositoryId: repo.id, number: i, githubCreatedAt: same });
    }
    const app = createApp();

    const ids: string[] = [];
    for (const offset of [0, 2, 4]) {
      const res = await request(app).get(`/repositories/${repo.id}/issues?limit=2&offset=${offset}`);
      expect(res.body.total).toBe(5);
      ids.push(...res.body.items.map((i: { id: string }) => i.id));
    }

    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toEqual([...ids].sort());
  });

  it.each([
    ["sort=bogus"],
    ["order=sideways"],
    ["priority=NOPE"],
    ["priority=HIGH,NOPE"],
    ["state="],
    ["state=OPEN,BOGUS"],
    ["limit=0"],
    ["limit=101"],
    ["offset=-1"],
  ])("rejects ?%s with a ZodIssue[] body", async (qs) => {
    const repo = await createRepository();

    const res = await request(createApp()).get(`/repositories/${repo.id}/issues?${qs}`);

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.error)).toBe(true);
  });

  it("404s for a missing repository with 'Repository not found'", async () => {
    const res = await request(createApp()).get("/repositories/nope/issues");

    expect(res.body.error.message).toBe("Repository not found");
  });
});
