import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
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

  it("lists a team's members ordered by name ascending", async () => {
    const team = await createTeam();
    for (const name of ["Charlie", "Alice", "Bob"]) {
      await createMember({ teamId: team.id, name });
    }

    const res = await request(createApp()).get(`/teams/${team.id}/members`);

    expect(res.body.items.map((m: { name: string }) => m.name)).toEqual([
      "Alice",
      "Bob",
      "Charlie",
    ]);
  });

  describe("q search", () => {
    const search = (teamId: string, q: string) =>
      request(createApp()).get(`/teams/${teamId}/members`).query({ q });
    const logins = (res: request.Response) =>
      res.body.items.map((m: { githubLogin: string }) => m.githubLogin);

    it("matches name case-insensitively, as a substring", async () => {
      const team = await createTeam();
      await createMember({
        teamId: team.id,
        name: "Grace Hopper",
        githubLogin: "gh1",
      });
      await createMember({
        teamId: team.id,
        name: "Alan Turing",
        githubLogin: "at1",
      });

      const res = await search(team.id, "ACE HOP");

      expect(res.status).toBe(200);
      expect(logins(res)).toEqual(["gh1"]);
      expect(res.body.total).toBe(1);
    });

    it("matches githubLogin case-insensitively, as a substring", async () => {
      const team = await createTeam();
      await createMember({
        teamId: team.id,
        name: "One",
        githubLogin: "Ada-Lovelace",
      });
      await createMember({
        teamId: team.id,
        name: "Two",
        githubLogin: "other",
      });

      const res = await search(team.id, "LOVE");

      expect(logins(res)).toEqual(["Ada-Lovelace"]);
    });

    it("only searches within the requested team", async () => {
      const team = await createTeam();
      await createMember({
        teamId: team.id,
        name: "Zed",
        githubLogin: "zed-in",
      });
      await createMember({ name: "Zed", githubLogin: "zed-out" });

      const res = await search(team.id, "zed");

      expect(logins(res)).toEqual(["zed-in"]);
    });

    it("returns an empty page when nothing matches", async () => {
      const team = await createTeam();
      await createMember({ teamId: team.id });

      const res = await search(team.id, "no-such-person");

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it.each(["", "   "])("treats blank q %j as no filter", async (q) => {
      const team = await createTeam();
      await createMember({ teamId: team.id });
      await createMember({ teamId: team.id });

      const res = await search(team.id, q);

      expect(res.body.total).toBe(2);
    });

    it("treats % and _ literally", async () => {
      const team = await createTeam();
      await createMember({
        teamId: team.id,
        name: "100% Real",
        githubLogin: "real",
      });
      await createMember({
        teamId: team.id,
        name: "Plain",
        githubLogin: "plain",
      });

      expect(logins(await search(team.id, "%"))).toEqual(["real"]);
      expect(logins(await search(team.id, "_"))).toEqual([]);
      expect(logins(await search(team.id, "\\"))).toEqual([]);
    });

    it("applies pagination to the filtered set", async () => {
      const team = await createTeam();
      for (const name of ["Dev A", "Dev B", "Dev C", "Other"]) {
        await createMember({ teamId: team.id, name });
      }

      const res = await request(createApp())
        .get(`/teams/${team.id}/members`)
        .query({ q: "dev", limit: 2, offset: 1 });

      expect(res.body.total).toBe(3);
      expect(res.body.items.map((m: { name: string }) => m.name)).toEqual([
        "Dev B",
        "Dev C",
      ]);
      expect(res.body.limit).toBe(2);
      expect(res.body.offset).toBe(1);
    });
  });
});

describe("POST /teams/:teamId/members", () => {
  it("creates a member", async () => {
    const team = await createTeam();

    const res = await request(createApp())
      .post(`/teams/${team.id}/members`)
      .send({ name: "Smoke", githubLogin: "smoke-user" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      teamId: team.id,
      githubLogin: "smoke-user",
    });
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

  it("POST under a missing team is 404 'Team not found'", async () => {
    const res = await request(createApp())
      .post("/teams/nope/members")
      .send({ name: "X", githubLogin: "x-user" });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Team not found");
  });

  it.each([
    ["login with a double hyphen", { name: "X", githubLogin: "a--b" }],
    ["login with a trailing hyphen", { name: "X", githubLogin: "x-" }],
    ["login longer than 39 chars", { name: "X", githubLogin: "a".repeat(40) }],
    ["blank name", { name: "   ", githubLogin: "x-user" }],
    [
      "name longer than 100 chars",
      { name: "n".repeat(101), githubLogin: "x-user" },
    ],
    ["missing githubLogin", { name: "X" }],
  ])("POST with %s is 400", async (_label, body) => {
    const team = await createTeam();

    const res = await request(createApp())
      .post(`/teams/${team.id}/members`)
      .send(body);

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.error)).toBe(true);
  });

  it("POST trims the name", async () => {
    const team = await createTeam();

    const res = await request(createApp())
      .post(`/teams/${team.id}/members`)
      .send({ name: "  Ada  ", githubLogin: "ada" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Ada");
  });
});

describe("/members/:id", () => {
  it("GET of a missing member is 404 'Member not found'", async () => {
    const res = await request(createApp()).get("/members/nope");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Member not found",
    });
  });

  it("GET returns the member", async () => {
    const member = await createMember({ githubLogin: "ada" });

    const res = await request(createApp()).get(`/members/${member.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: member.id,
      githubLogin: "ada",
      teamId: member.teamId,
    });
  });

  it("PATCH allows changing the case of the member's own login", async () => {
    const member = await createMember({ githubLogin: "smoke-user" });

    const res = await request(createApp())
      .patch(`/members/${member.id}`)
      .send({ githubLogin: "SMOKE-USER" });

    expect(res.status).toBe(200);
    expect(res.body.githubLogin).toBe("SMOKE-USER");
  });

  it("PATCH moves the member to another team", async () => {
    const member = await createMember();
    const target = await createTeam();

    const res = await request(createApp())
      .patch(`/members/${member.id}`)
      .send({ teamId: target.id });

    expect(res.status).toBe(200);
    expect(res.body.teamId).toBe(target.id);
  });

  it("PATCH 404s when moving to a missing team", async () => {
    const member = await createMember();

    const res = await request(createApp())
      .patch(`/members/${member.id}`)
      .send({ teamId: "missing" });

    expect(res.status).toBe(404);
  });

  // Regression: an empty teamId used to skip the team check and hit the FK -> 409.
  it("PATCH rejects empty teamId with 400 and a ZodIssue[] at path [teamId]", async () => {
    const member = await createMember();

    const res = await request(createApp())
      .patch(`/members/${member.id}`)
      .send({ teamId: "" });

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.error)).toBe(true);
    expect(res.body.error[0].path).toEqual(["teamId"]);
  });

  it("PATCH of a missing member is 404 'Member not found'", async () => {
    const res = await request(createApp())
      .patch("/members/nope")
      .send({ name: "x" });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Member not found");
  });

  it("PATCH to another member's login (any case) is 409 and changes nothing", async () => {
    await createMember({ githubLogin: "ada" });
    const grace = await createMember({ githubLogin: "grace" });

    const res = await request(createApp())
      .patch(`/members/${grace.id}`)
      .send({ githubLogin: "ADA" });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("githubLogin already exists");
    const row = await prisma.member.findUnique({ where: { id: grace.id } });
    expect(row?.githubLogin).toBe("grace");
  });

  it.each([
    ["empty body", {}],
    ["valid key plus unknown key", { name: "ok", nmae: "x" }],
  ])("PATCH with %s is 400 and changes nothing", async (_label, body) => {
    const member = await createMember({ name: "before" });

    const res = await request(createApp())
      .patch(`/members/${member.id}`)
      .send(body);

    expect(res.status).toBe(400);
    expect(
      (await prisma.member.findUnique({ where: { id: member.id } }))?.name,
    ).toBe("before");
  });

  it("PATCH persists the move", async () => {
    const member = await createMember();
    const target = await createTeam();

    await request(createApp())
      .patch(`/members/${member.id}`)
      .send({ teamId: target.id });

    expect(
      (await prisma.member.findUnique({ where: { id: member.id } }))?.teamId,
    ).toBe(target.id);
  });

  it("DELETE deletes, then 404s", async () => {
    const member = await createMember();
    const app = createApp();

    expect((await request(app).delete(`/members/${member.id}`)).status).toBe(
      204,
    );
    expect((await request(app).delete(`/members/${member.id}`)).status).toBe(
      404,
    );
  });
});
