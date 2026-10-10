import request from "supertest";
import { describe, expect, it } from "vitest";
import { teamSchema } from "@devpulse/shared";
import { createApp } from "../src/app";
import { prisma } from "../src/db";

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
});
