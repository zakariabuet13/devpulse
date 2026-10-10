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
});
