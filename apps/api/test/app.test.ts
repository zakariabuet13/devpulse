import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";

afterEach(() => vi.unstubAllEnvs());

describe("error shape by NODE_ENV", () => {
  it("returns the dev envelope with code and stack", async () => {
    const res = await request(createApp()).get("/teams/nope");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.stack).toBeTypeOf("string");
  });

  it("returns the exact production body", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const res = await request(createApp()).get("/teams/nope");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Team not found" });
  });
});

describe("app plumbing", () => {
  it("404s an unknown route", async () => {
    const res = await request(createApp()).get("/no/such/route");

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Route not found");
  });

  it("sets an X-Request-Id header", async () => {
    const res = await request(createApp()).get("/health");

    expect(res.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("sets a distinct X-Request-Id per request, including on error responses", async () => {
    const app = createApp();

    const ok = await request(app).get("/health");
    const err = await request(app).get("/teams/nope");

    expect(err.headers["x-request-id"]).toBeTruthy();
    expect(err.headers["x-request-id"]).not.toBe(ok.headers["x-request-id"]);
  });
});

describe("production error bodies", () => {
  it("keeps validation errors as a ZodIssue[]", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const res = await request(createApp()).post("/teams").send({ name: "  " });

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.error)).toBe(true);
    expect(res.body.error[0].path).toEqual(["name"]);
  });

  it("returns a plain string for an unknown route, with no stack", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const res = await request(createApp()).get("/no/such/route");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Route not found" });
  });
});

describe("pagination validation on every list endpoint", () => {
  const lists = [
    "/teams/x/members",
    "/teams/x/repositories",
    "/repositories/x/issues",
    "/repositories/x/pull-requests",
  ];

  it.each(
    lists.flatMap((path) =>
      ["limit=0", "limit=101", "offset=-1"].map((qs) => [path, qs]),
    ),
  )("%s?%s is 400 with a ZodIssue[] body", async (path, qs) => {
    const res = await request(createApp()).get(`${path}?${qs}`);

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.error)).toBe(true);
  });
});
