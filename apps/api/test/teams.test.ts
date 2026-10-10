import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { teamSchema } from "@devpulse/shared";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { createMember, createRepository, createTeam } from "./factories";

afterEach(() => vi.unstubAllEnvs());

describe("GET /teams", () => {
  it("returns the page envelope with default limit/offset", async () => {
    await createTeam();

    const res = await request(createApp()).get("/teams");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, limit: 20, offset: 0 });
    expect(res.body.items).toHaveLength(1);
  });

  it("honours limit=1", async () => {
    await createTeam();
    await createTeam();

    const res = await request(createApp()).get("/teams?limit=1");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(2);
  });

  it.each(["0", "101"])("rejects limit=%s with a ZodIssue[] body", async (limit) => {
    const res = await request(createApp()).get(`/teams?limit=${limit}`);

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.error)).toBe(true);
  });
});

describe("POST /teams", () => {
  it("creates a team", async () => {
    const res = await request(createApp()).post("/teams").send({ name: "Platform" });

    expect(res.status).toBe(201);
    const team = teamSchema.parse(res.body);
    expect(team.name).toBe("Platform");

    const row = await prisma.team.findUnique({ where: { id: team.id } });
    expect(row?.name).toBe("Platform");
    // Tables are truncated before each test, so this is the only team.
    expect(await prisma.team.count()).toBe(1);
  });

  it("rejects a blank name with a ZodIssue[] at path [name]", async () => {
    const res = await request(createApp()).post("/teams").send({ name: "  " });

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.error)).toBe(true);
    expect(res.body.error[0].path).toEqual(["name"]);
  });

  it("rejects malformed JSON with BAD_REQUEST (dev envelope)", async () => {
    const res = await request(createApp())
      .post("/teams")
      .set("Content-Type", "application/json")
      .send("{bad");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("rejects malformed JSON with a plain string error in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const res = await request(createApp())
      .post("/teams")
      .set("Content-Type", "application/json")
      .send("{bad");

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
    expect(Object.keys(res.body)).toEqual(["error"]);
  });
});

describe("/teams/:id", () => {
  it("GET returns the team with createdAt", async () => {
    const team = await createTeam();

    const res = await request(createApp()).get(`/teams/${team.id}`);

    expect(res.status).toBe(200);
    expect(res.body.createdAt).toBeTypeOf("string");
  });

  it("GET unknown id is 404", async () => {
    const res = await request(createApp()).get("/teams/nope");

    expect(res.status).toBe(404);
  });

  it("PATCH renames", async () => {
    const team = await createTeam();

    const res = await request(createApp()).patch(`/teams/${team.id}`).send({ name: "renamed" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("renamed");
  });

  it.each([
    ["empty body", {}],
    ["unknown key", { nmae: "x" }],
  ])("PATCH with %s is 400", async (_label, body) => {
    const team = await createTeam();

    const res = await request(createApp()).patch(`/teams/${team.id}`).send(body);

    expect(res.status).toBe(400);
  });

  it("DELETE removes an empty team, then 404s", async () => {
    const team = await createTeam();
    const app = createApp();

    expect((await request(app).delete(`/teams/${team.id}`)).status).toBe(204);
    expect((await request(app).delete(`/teams/${team.id}`)).status).toBe(404);
  });

  it.each([
    ["members", (teamId: string) => createMember({ teamId })],
    ["repositories", (teamId: string) => createRepository({ teamId })],
  ])("DELETE a team with %s is 409", async (_label, addChild) => {
    const team = await createTeam();
    await addChild(team.id);

    const res = await request(createApp()).delete(`/teams/${team.id}`);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("Team has members or repositories");
  });

  it("DELETE a non-empty team returns the exact production body", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const team = await createTeam();
    await createMember({ teamId: team.id });

    const res = await request(createApp()).delete(`/teams/${team.id}`);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Team has members or repositories" });
  });

  it("DELETE succeeds once the children are removed", async () => {
    const team = await createTeam();
    const member = await createMember({ teamId: team.id });
    const app = createApp();

    expect((await request(app).delete(`/teams/${team.id}`)).status).toBe(409);
    expect((await request(app).delete(`/members/${member.id}`)).status).toBe(204);
    expect((await request(app).delete(`/teams/${team.id}`)).status).toBe(204);
  });

  it("GET / PATCH of a missing team is 404 'Team not found'", async () => {
    const app = createApp();

    const get = await request(app).get("/teams/nope");
    const patch = await request(app).patch("/teams/nope").send({ name: "x" });

    for (const res of [get, patch]) {
      expect(res.status).toBe(404);
      expect(res.body.error).toMatchObject({ code: "NOT_FOUND", message: "Team not found" });
    }
  });

  it("PATCH with a valid key plus an unknown key is rejected and nothing changes", async () => {
    const team = await createTeam({ name: "before" });

    const res = await request(createApp())
      .patch(`/teams/${team.id}`)
      .send({ name: "after", nmae: "x" });

    expect(res.status).toBe(400);
    expect((await prisma.team.findUnique({ where: { id: team.id } }))?.name).toBe("before");
  });

  it("PATCH persists the new name", async () => {
    const team = await createTeam({ name: "before" });

    await request(createApp()).patch(`/teams/${team.id}`).send({ name: "after" });

    expect((await prisma.team.findUnique({ where: { id: team.id } }))?.name).toBe("after");
  });
});

describe("GET /teams ordering and paging", () => {
  it("orders by createdAt ascending regardless of insert order", async () => {
    await createTeam({ name: "B", createdAt: new Date("2024-01-02T00:00:00Z") });
    await createTeam({ name: "C", createdAt: new Date("2024-01-03T00:00:00Z") });
    await createTeam({ name: "A", createdAt: new Date("2024-01-01T00:00:00Z") });

    const res = await request(createApp()).get("/teams");

    expect(res.body.items.map((t: { name: string }) => t.name)).toEqual(["A", "B", "C"]);
  });

  it("offset skips exactly offset rows", async () => {
    for (const day of ["01", "02", "03"]) {
      await createTeam({ name: `T${day}`, createdAt: new Date(`2024-01-${day}T00:00:00Z`) });
    }

    const res = await request(createApp()).get("/teams?limit=1&offset=1");

    expect(res.body).toMatchObject({ total: 3, limit: 1, offset: 1 });
    expect(res.body.items.map((t: { name: string }) => t.name)).toEqual(["T02"]);
  });

  it("pages through rows with identical createdAt using the id tiebreaker", async () => {
    const same = new Date("2024-01-01T00:00:00Z");
    for (let i = 0; i < 5; i++) await createTeam({ createdAt: same });
    const app = createApp();

    const ids: string[] = [];
    for (const offset of [0, 2, 4]) {
      const res = await request(app).get(`/teams?limit=2&offset=${offset}`);
      ids.push(...res.body.items.map((t: { id: string }) => t.id));
    }

    expect(new Set(ids).size).toBe(5);
    expect(ids).toEqual([...ids].sort());
  });

  it("accepts limit=100 and echoes it", async () => {
    const res = await request(createApp()).get("/teams?limit=100");

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
  });

  it.each(["-1", "abc"])("rejects offset=%s with a ZodIssue[] body", async (offset) => {
    const res = await request(createApp()).get(`/teams?offset=${offset}`);

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.error)).toBe(true);
  });
});
