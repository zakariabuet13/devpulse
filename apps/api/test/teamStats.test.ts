import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { teamStatsSchema } from "@devpulse/shared";
import { createApp } from "../src/app";
import {
  createIssue,
  createPullRequest,
  createRepository,
  createTeam,
} from "./factories";

afterEach(() => vi.useRealTimers());

const DAY = 24 * 60 * 60 * 1000;

describe("GET /teams/:teamId/stats", () => {
  it("returns zeros for every priority on an empty team", async () => {
    const team = await createTeam();

    const res = await request(createApp()).get(`/teams/${team.id}/stats`);

    expect(res.status).toBe(200);
    expect(teamStatsSchema.parse(res.body)).toEqual({
      openIssuesByPriority: { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 },
      openPullRequests: 0,
      mergedLast7Days: 0,
    });
  });

  it("counts open issues per priority across the team's repositories, ignoring closed ones", async () => {
    const team = await createTeam();
    const a = await createRepository({ teamId: team.id });
    const b = await createRepository({ teamId: team.id });
    await createIssue({ repositoryId: a.id, priority: "URGENT" });
    await createIssue({ repositoryId: a.id, priority: "LOW" });
    await createIssue({ repositoryId: b.id, priority: "LOW" });
    await createIssue({ repositoryId: b.id, priority: "HIGH", state: "CLOSED" });

    const res = await request(createApp()).get(`/teams/${team.id}/stats`);

    expect(res.body.openIssuesByPriority).toEqual({ LOW: 2, MEDIUM: 0, HIGH: 0, URGENT: 1 });
  });

  it("counts only OPEN pull requests", async () => {
    const team = await createTeam();
    const repo = await createRepository({ teamId: team.id });
    await createPullRequest({ repositoryId: repo.id, state: "OPEN" });
    await createPullRequest({ repositoryId: repo.id, state: "OPEN" });
    await createPullRequest({ repositoryId: repo.id, state: "CLOSED" });
    await createPullRequest({ repositoryId: repo.id, state: "MERGED", mergedAt: new Date() });

    const res = await request(createApp()).get(`/teams/${team.id}/stats`);

    expect(res.body.openPullRequests).toBe(2);
  });

  it("counts merged PRs on the 7-day boundary (inclusive) but not 1ms older", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = new Date("2025-06-15T12:00:00.000Z");
    vi.setSystemTime(now);
    const team = await createTeam();
    const repo = await createRepository({ teamId: team.id });
    const merged = (mergedAt: Date) =>
      createPullRequest({ repositoryId: repo.id, state: "MERGED", mergedAt });
    await merged(new Date(now.getTime() - 7 * DAY));
    await merged(new Date(now.getTime() - 7 * DAY - 1));
    await merged(new Date(now.getTime() - DAY));

    const res = await request(createApp()).get(`/teams/${team.id}/stats`);

    expect(res.body.mergedLast7Days).toBe(2);
  });

  it("ignores non-MERGED PRs even with a recent mergedAt", async () => {
    const team = await createTeam();
    const repo = await createRepository({ teamId: team.id });
    await createPullRequest({ repositoryId: repo.id, state: "CLOSED", mergedAt: new Date() });

    const res = await request(createApp()).get(`/teams/${team.id}/stats`);

    expect(res.body.mergedLast7Days).toBe(0);
  });

  it("does not count other teams' data", async () => {
    const team = await createTeam();
    const other = await createRepository({ teamId: (await createTeam()).id });
    await createIssue({ repositoryId: other.id, priority: "HIGH" });
    await createPullRequest({ repositoryId: other.id, state: "OPEN" });
    await createPullRequest({ repositoryId: other.id, state: "MERGED", mergedAt: new Date() });

    const res = await request(createApp()).get(`/teams/${team.id}/stats`);

    expect(res.body).toEqual({
      openIssuesByPriority: { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 },
      openPullRequests: 0,
      mergedLast7Days: 0,
    });
  });

  it("404s for a missing team with 'Team not found'", async () => {
    const res = await request(createApp()).get("/teams/nope/stats");

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Team not found");
  });
});
