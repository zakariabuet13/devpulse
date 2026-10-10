import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
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
});
