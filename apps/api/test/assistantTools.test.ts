import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAssistantTools } from "../src/ai/assistantTools";

// Spec: docs/SPEC-ask-devpulse.md (tools). The tools read data through the REST API over
// global fetch (loopback), stubbed here, so nothing touches the network or the DB.

const BASE = "http://api.test";
const NOW = new Date("2026-10-13T08:00:00.000Z");
const DAY = 24 * 3_600_000;
const iso = (agoMs: number) => new Date(NOW.getTime() - agoMs).toISOString();

type Call = { url: URL; signal?: AbortSignal | null };
let calls: Call[];

const page = (items: unknown[], total = items.length) => ({
  items,
  total,
  limit: 20,
  offset: 0,
});

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// Replaces global fetch; `handler` decides the response for each loopback call.
const stubRest = (handler: (url: URL) => Response | Promise<Response>) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string, init?: RequestInit) => {
      const u = new URL(String(url));
      calls.push({ url: u, signal: init?.signal });
      return handler(u);
    }),
  );

// The tool objects are typed per-tool; look them up by name and call `run` directly
// (the runner would have zod-validated the input first).
const tool = (name: string, signal?: AbortSignal) => {
  const t = createAssistantTools(signal).find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t as unknown as { run: (args: unknown) => Promise<string> };
};

const result = async (name: string, args: unknown) =>
  JSON.parse(await tool(name).run(args));

const issue = (n: number) => ({
  id: `i${n}`,
  repositoryId: "r1",
  number: n,
  title: `Issue ${n}`,
  body: "SECRET-BODY-TEXT",
  state: "OPEN",
  labels: ["bug"],
  priority: "HIGH",
  aiSummary: "SECRET-AI-SUMMARY",
  githubCreatedAt: iso(DAY),
});

const pr = (
  id: string,
  state: "OPEN" | "CLOSED" | "MERGED",
  reviewRequestedAt: string | null,
) => ({
  id,
  repositoryId: "r1",
  number: 1,
  title: `PR ${id}`,
  state,
  author: "dev",
  reviewRequestedAt,
  mergedAt: null,
});

beforeEach(() => {
  calls = [];
  vi.stubEnv("API_SELF_URL", BASE);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("createAssistantTools", () => {
  it("returns the 4 tools in a fixed order", () => {
    expect(createAssistantTools().map((t) => t.name)).toEqual([
      "list_teams",
      "search_issues",
      "list_pull_requests",
      "team_stats",
    ]);
  });
});

describe("list_teams", () => {
  it("calls GET /teams and returns only id and name", async () => {
    stubRest(() =>
      respond(page([{ id: "t1", name: "Core", createdAt: iso(DAY) }])),
    );
    const out = await result("list_teams", {});

    expect(calls[0].url.origin + calls[0].url.pathname).toBe(`${BASE}/teams`);
    expect(out.items).toEqual([{ id: "t1", name: "Core" }]);
  });

  it("returns at most 20 teams even if the API returns more", async () => {
    stubRest(() =>
      respond(
        page(
          Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, name: "T" })),
          30,
        ),
      ),
    );
    const out = await result("list_teams", {});
    expect(out.items).toHaveLength(20);
    expect(out.total).toBe(30);
  });
});

describe("search_issues", () => {
  it("strips body, aiSummary and repositoryId from every row", async () => {
    stubRest(() => respond(page([issue(1), issue(2)])));
    const raw = await tool("search_issues").run({ teamId: "t1" });
    const out = JSON.parse(raw);

    expect(out.items).toHaveLength(2);
    for (const row of out.items) {
      expect(row).not.toHaveProperty("body");
      expect(row).not.toHaveProperty("aiSummary");
      expect(row).not.toHaveProperty("repositoryId");
      expect(row).toHaveProperty("title");
    }
    expect(raw).not.toContain("SECRET-BODY-TEXT");
    expect(raw).not.toContain("SECRET-AI-SUMMARY");
  });

  it("returns at most 20 rows even if the API returns more", async () => {
    stubRest(() =>
      respond(
        page(
          Array.from({ length: 30 }, (_, i) => issue(i)),
          30,
        ),
      ),
    );
    const out = await result("search_issues", { teamId: "t1" });
    expect(out.items).toHaveLength(20);
    expect(out.total).toBe(30);
  });

  it("forwards filters and asks the API for at most 20 rows", async () => {
    stubRest(() => respond(page([])));
    await tool("search_issues").run({
      teamId: "t1",
      q: "login",
      state: "OPEN",
      priority: "URGENT",
      limit: 5,
    });

    const { url } = calls[0];
    expect(url.pathname).toBe("/teams/t1/issues");
    expect(url.searchParams.get("q")).toBe("login");
    expect(url.searchParams.get("state")).toBe("OPEN");
    expect(url.searchParams.get("priority")).toBe("URGENT");
    expect(url.searchParams.get("limit")).toBe("5");
  });

  it("defaults the limit to 20 and clamps a larger one", async () => {
    stubRest(() => respond(page([])));
    await tool("search_issues").run({ teamId: "t1" });
    await tool("search_issues").run({ teamId: "t1", limit: 99 });

    expect(calls[0].url.searchParams.get("limit")).toBe("20");
    expect(calls[1].url.searchParams.get("limit")).toBe("20");
  });

  it("omits filters that were not given", async () => {
    stubRest(() => respond(page([])));
    await tool("search_issues").run({ teamId: "t1" });
    for (const k of ["q", "state", "priority"]) {
      expect(calls[0].url.searchParams.has(k)).toBe(false);
    }
  });

  it("url-encodes the team id so it cannot change the path", async () => {
    stubRest(() => respond(page([])));
    await tool("search_issues").run({ teamId: "../admin?x=1" });

    expect(calls[0].url.pathname).toBe("/teams/..%2Fadmin%3Fx%3D1/issues");
    expect(calls[0].url.searchParams.has("x")).toBe(false);
  });
});

describe("list_pull_requests", () => {
  it("forwards state and returns at most 20 rows", async () => {
    stubRest(() =>
      respond(
        page(
          Array.from({ length: 30 }, (_, i) => pr(`p${i}`, "MERGED", null)),
          30,
        ),
      ),
    );
    const out = await result("list_pull_requests", {
      teamId: "t1",
      state: "MERGED",
    });

    expect(calls[0].url.pathname).toBe("/teams/t1/pull-requests");
    expect(calls[0].url.searchParams.get("state")).toBe("MERGED");
    expect(out.items).toHaveLength(20);
    expect(out.total).toBe(30);
  });

  describe("stale filter", () => {
    const staleRows = () =>
      respond(
        page([
          pr("exactly-3d", "OPEN", iso(3 * DAY)),
          pr("just-over-3d", "OPEN", iso(3 * DAY + 1000)),
          pr("fresh", "OPEN", iso(DAY)),
          pr("not-requested", "OPEN", null),
          pr("closed", "CLOSED", iso(9 * DAY)),
          pr("merged", "MERGED", iso(9 * DAY)),
        ]),
      );

    it("asks the API for open PRs, oldest review request first", async () => {
      stubRest(staleRows);
      await tool("list_pull_requests").run({ teamId: "t1", stale: true });

      const { searchParams } = calls[0].url;
      expect(searchParams.get("state")).toBe("OPEN");
      expect(searchParams.get("sort")).toBe("reviewRequestedAt");
      expect(searchParams.get("order")).toBe("asc");
    });

    it("keeps only PRs waiting MORE than 3 days (exactly 3 days is not stale)", async () => {
      stubRest(staleRows);
      const out = await result("list_pull_requests", {
        teamId: "t1",
        stale: true,
      });

      expect(out.items.map((p: { id: string }) => p.id)).toEqual([
        "just-over-3d",
      ]);
      expect(out.total).toBe(1);
    });

    it("lists the stalest first and caps at 20", async () => {
      stubRest(() =>
        respond(
          page(
            Array.from({ length: 30 }, (_, i) =>
              pr(`p${i}`, "OPEN", iso(4 * DAY + i * 1000)),
            ),
            30,
          ),
        ),
      );
      const out = await result("list_pull_requests", {
        teamId: "t1",
        stale: true,
      });

      expect(out.items).toHaveLength(20);
      expect(out.total).toBe(30);
      expect(out.items[0].id).toBe("p29"); // oldest request = most stale
    });

    it("respects a smaller limit", async () => {
      stubRest(() =>
        respond(
          page(
            Array.from({ length: 10 }, (_, i) =>
              pr(`p${i}`, "OPEN", iso(5 * DAY + i * 1000)),
            ),
          ),
        ),
      );
      const out = await result("list_pull_requests", {
        teamId: "t1",
        stale: true,
        limit: 3,
      });
      expect(out.items).toHaveLength(3);
    });
  });
});

describe("team_stats", () => {
  it("calls GET /teams/:id/stats and returns the stats as given", async () => {
    const stats = {
      openIssuesByPriority: { LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 },
      openPullRequests: 5,
      mergedLast7Days: 6,
    };
    stubRest(() => respond(stats));
    const out = await result("team_stats", { teamId: "t1" });

    expect(calls[0].url.pathname).toBe("/teams/t1/stats");
    expect(out).toEqual(stats);
  });
});

describe("failures return one generic result and leak nothing", () => {
  const calls_ = [
    ["list_teams", {}],
    ["search_issues", { teamId: "t1" }],
    ["list_pull_requests", { teamId: "t1" }],
    ["list_pull_requests", { teamId: "t1", stale: true }],
    ["team_stats", { teamId: "t1" }],
  ] as const;

  it.each(calls_)("%s: upstream 500 with a body", async (name, args) => {
    stubRest(() =>
      respond({ error: "UPSTREAM-BODY-123 postgres://secret" }, 500),
    );
    const out = await tool(name).run(args);

    expect(typeof out).toBe("string");
    expect(out).not.toContain("UPSTREAM-BODY-123");
    expect(out).not.toContain("postgres://");
    expect(out.length).toBeGreaterThan(0);
  });

  it.each(calls_)("%s: upstream 404", async (name, args) => {
    stubRest(() => respond({ error: "Team not found" }, 404));
    const out = await tool(name).run(args);
    expect(out).not.toContain("Team not found");
  });

  it.each(calls_)("%s: network error", async (name, args) => {
    stubRest(() => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:4000 SECRET-HOST");
    });
    const out = await tool(name).run(args);

    expect(out).not.toContain("ECONNREFUSED");
    expect(out).not.toContain("SECRET-HOST");
  });

  it("gives the model the same message for every failure", async () => {
    stubRest(() => respond({}, 500));
    const a = await tool("list_teams").run({});
    const b = await tool("team_stats").run({ teamId: "t1" });
    expect(a).toBe(b);
  });

  it("does not throw (a throw would abort the whole answer)", async () => {
    stubRest(() => {
      throw new Error("boom");
    });
    await expect(tool("list_teams").run({})).resolves.toEqual(
      expect.any(String),
    );
  });
});

describe("abort", () => {
  it("passes the caller's signal to the loopback request", async () => {
    stubRest(() => respond(page([])));
    const controller = new AbortController();
    await tool("list_teams", controller.signal).run({});

    expect(calls[0].signal).toBe(controller.signal);
  });
});
