import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createRepository, createTeam } from "./factories";

describe("POST /teams/:teamId/repositories", () => {
  // Bug: Prisma's `mode: "insensitive"` equals compiles to ILIKE, so `_` acts as a wildcard.
  it("treats _ in githubFullName literally (devpulse/ap_ is not devpulse/api)", async () => {
    const team = await createTeam();
    await createRepository({ teamId: team.id, githubFullName: "devpulse/api" });

    const res = await request(createApp())
      .post(`/teams/${team.id}/repositories`)
      .send({ githubFullName: "devpulse/ap_" });

    expect(res.status).toBe(201);
    expect(res.body.githubFullName).toBe("devpulse/ap_");
  });

  // Guard: case-insensitive uniqueness must keep working after the fix.
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
