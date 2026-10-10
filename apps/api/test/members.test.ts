import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createMember } from "./factories";

describe("PATCH /members/:id", () => {
  // Bug: empty teamId skips the `if (data.teamId)` guard and hits the FK -> 409.
  it("rejects empty teamId with 400 and a ZodIssue[] at path [teamId]", async () => {
    const member = await createMember();

    const res = await request(createApp()).patch(`/members/${member.id}`).send({ teamId: "" });

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.error)).toBe(true);
    expect(res.body.error[0].path).toEqual(["teamId"]);
  });
});
