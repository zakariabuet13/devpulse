import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createIssue, createRepository, createTeam } from "./factories";

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
});
