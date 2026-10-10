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

    expect(res.headers["x-request-id"]).toBeTruthy();
  });
});
