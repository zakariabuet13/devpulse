import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { createMember, createTeam } from "./factories";

afterEach(() => vi.unstubAllEnvs());

describe("GET /teams/:teamId/members", () => {
  it("lists the team's members", async () => {
    const team = await createTeam();
    await createMember({ teamId: team.id, githubLogin: "ada" });
    await createMember(); // other team

    const res = await request(createApp()).get(`/teams/${team.id}/members`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].githubLogin).toBe("ada");
  });

  it("404s for a missing team", async () => {
    const res = await request(createApp()).get("/teams/nope/members");

    expect(res.status).toBe(404);
  });
});

describe("POST /teams/:teamId/members", () => {
  it("creates a member", async () => {
    const team = await createTeam();

    const res = await request(createApp())
      .post(`/teams/${team.id}/members`)
      .send({ name: "Smoke", githubLogin: "smoke-user" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ teamId: team.id, githubLogin: "smoke-user" });
  });

  it("rejects a case-differing duplicate login with a 409 dev envelope", async () => {
    const team = await createTeam();
    await createMember({ githubLogin: "ada" });

    const res = await request(createApp())
      .post(`/teams/${team.id}/members`)
      .send({ name: "Dup", githubLogin: "Ada" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: "CONFLICT",
      message: "githubLogin already exists",
    });
    expect(res.body.error.stack).toBeTypeOf("string");
  });

  it("returns the exact production body for a duplicate login", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const team = await createTeam();
    await createMember({ githubLogin: "ada" });

    const res = await request(createApp())
      .post(`/teams/${team.id}/members`)
      .send({ name: "Dup", githubLogin: "Ada" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "githubLogin already exists" });
  });

  it("rejects an invalid login with 400", async () => {
    const team = await createTeam();

    const res = await request(createApp())
      .post(`/teams/${team.id}/members`)
      .send({ name: "Bad", githubLogin: "-x" });

    expect(res.status).toBe(400);
  });
});

describe("PATCH /members/:id", () => {
  it("allows changing the case of the member's own login", async () => {
    const member = await createMember({ githubLogin: "smoke-user" });

    const res = await request(createApp())
      .patch(`/members/${member.id}`)
      .send({ githubLogin: "SMOKE-USER" });

    expect(res.status).toBe(200);
    expect(res.body.githubLogin).toBe("SMOKE-USER");
  });

  it("moves the member to another team", async () => {
    const member = await createMember();
    const target = await createTeam();

    const res = await request(createApp())
      .patch(`/members/${member.id}`)
      .send({ teamId: target.id });

    expect(res.status).toBe(200);
    expect(res.body.teamId).toBe(target.id);
  });

  it("404s when moving to a missing team", async () => {
    const member = await createMember();

    const res = await request(createApp())
      .patch(`/members/${member.id}`)
      .send({ teamId: "missing" });

    expect(res.status).toBe(404);
  });

  // Regression: an empty teamId used to skip the team check and hit the FK -> 409.
  it("rejects empty teamId with 400 and a ZodIssue[] at path [teamId]", async () => {
    const member = await createMember();

    const res = await request(createApp()).patch(`/members/${member.id}`).send({ teamId: "" });

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.error)).toBe(true);
    expect(res.body.error[0].path).toEqual(["teamId"]);
  });
});

describe("DELETE /members/:id", () => {
  it("deletes, then 404s", async () => {
    const member = await createMember();
    const app = createApp();

    expect((await request(app).delete(`/members/${member.id}`)).status).toBe(204);
    expect((await request(app).delete(`/members/${member.id}`)).status).toBe(404);
  });
});
