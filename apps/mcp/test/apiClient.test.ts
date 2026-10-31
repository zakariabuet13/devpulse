import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Assumed module/exports: src/apiClient.ts -> createApiClient(opts?: { baseUrl?: string }): DevPulseApi
import { createApiClient } from "../src/apiClient.js";

const SECRET = "SECRET-TOKEN-123";
const BODY_LEAK = "RESPONSE-BODY-LEAK";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const page = <T>(
  items: T[],
  total = items.length,
  limit = 100,
  offset = 0,
) => ({
  items,
  total,
  limit,
  offset,
});
const team = (id: string) => ({
  id,
  name: `Team ${id}`,
  createdAt: "2026-01-01T00:00:00.000Z",
});

let fetchMock: ReturnType<typeof vi.fn>;
const urlOf = (call: number) => new URL(String(fetchMock.mock.calls[call][0]));
const initOf = (call: number) =>
  (fetchMock.mock.calls[call][1] ?? {}) as RequestInit;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("DEVPULSE_API_URL", "");
  vi.stubEnv("GITHUB_TOKEN", SECRET);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("base URL handling", () => {
  it("defaults to http://localhost:4000 when DEVPULSE_API_URL is unset", async () => {
    vi.stubEnv("DEVPULSE_API_URL", "");
    delete process.env.DEVPULSE_API_URL;
    fetchMock.mockResolvedValue(json(page([])));
    await createApiClient().listTeams();
    expect(urlOf(0).origin).toBe("http://localhost:4000");
    expect(urlOf(0).pathname).toBe("/teams");
  });

  it("uses DEVPULSE_API_URL from env", async () => {
    vi.stubEnv("DEVPULSE_API_URL", "http://api.example:5000");
    fetchMock.mockResolvedValue(json(page([])));
    await createApiClient().listTeams();
    expect(urlOf(0).origin).toBe("http://api.example:5000");
  });

  it("explicit baseUrl option wins over env", async () => {
    vi.stubEnv("DEVPULSE_API_URL", "http://env.example:1");
    fetchMock.mockResolvedValue(json(page([])));
    await createApiClient({ baseUrl: "http://opt.example:2" }).listTeams();
    expect(urlOf(0).origin).toBe("http://opt.example:2");
  });

  it("tolerates a trailing slash on the base URL (no double slash)", async () => {
    fetchMock.mockResolvedValue(json(page([])));
    await createApiClient({ baseUrl: "http://api.example:5000/" }).listTeams();
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("//teams");
    expect(urlOf(0).pathname).toBe("/teams");
  });
});

describe("read-only and headers", () => {
  it("only issues GET requests and sends no body", async () => {
    fetchMock.mockImplementation(async (u: string) =>
      String(u).includes("/stats")
        ? json({
            openIssuesByPriority: {},
            openPullRequests: 0,
            mergedLast7Days: 0,
          })
        : String(u).includes("/repositories")
          ? json(page([]))
          : String(u).includes("/issues") ||
              String(u).includes("/pull-requests")
            ? json(page([]))
            : String(u).endsWith("/teams/t1")
              ? json(team("t1"))
              : json(page([])),
    );
    const api = createApiClient();
    await api.listTeams();
    await api.teamOverview("t1");
    await api.searchIssues("t1", {} as never);
    await api.listPullRequests("t1", {} as never);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(6);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init?.method ?? "GET").toUpperCase()).toBe("GET");
      expect(init?.body).toBeUndefined();
    }
  });

  it("sends no Authorization header (spec defines no API token) and never forwards env secrets", async () => {
    fetchMock.mockResolvedValue(json(page([])));
    await createApiClient().listTeams();
    const headers = new Headers(initOf(0).headers);
    expect(headers.has("authorization")).toBe(false);
    expect(JSON.stringify([...headers])).not.toContain(SECRET);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(SECRET);
  });
});

describe("listTeams", () => {
  it("GETs /teams and returns items", async () => {
    fetchMock.mockResolvedValue(json(page([team("a"), team("b")])));
    const teams = await createApiClient().listTeams();
    expect(teams.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("follows pagination until all pages are fetched", async () => {
    fetchMock
      .mockResolvedValueOnce(json(page([team("a"), team("b")], 3, 2, 0)))
      .mockResolvedValueOnce(json(page([team("c")], 3, 2, 2)));
    const teams = await createApiClient().listTeams();
    expect(teams.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urlOf(1).searchParams.get("offset")).toBe("2");
  });
});

describe("teamOverview URL building", () => {
  const stats = {
    openIssuesByPriority: {},
    openPullRequests: 0,
    mergedLast7Days: 0,
  };
  const stub = () =>
    fetchMock.mockImplementation(async (u: string) => {
      const p = new URL(String(u)).pathname;
      if (p.endsWith("/stats")) return json(stats);
      if (p.endsWith("/repositories")) return json(page([]));
      return json(team("x"));
    });

  it("fetches team, stats and repositories and combines them", async () => {
    stub();
    const o = await createApiClient().teamOverview("t1");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const paths = fetchMock.mock.calls
      .map((c) => new URL(String(c[0])).pathname)
      .sort();
    expect(paths).toEqual([
      "/teams/t1",
      "/teams/t1/repositories",
      "/teams/t1/stats",
    ]);
    expect(o).toMatchObject({ team: { id: "x" }, stats, repositories: [] });
  });

  it.each([
    ["a/b", "a%2Fb"],
    ["a?b=1", "a%3Fb%3D1"],
    ["a b", "a%20b"],
    ["../admin", "..%2Fadmin"],
    ["a#b", "a%23b"],
  ])("encodes teamId %j as %s in every request", async (id, enc) => {
    stub();
    await createApiClient().teamOverview(id);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [u] of fetchMock.mock.calls) {
      const raw = String(u);
      expect(raw).toContain(`/teams/${enc}`);
      expect(new URL(raw).search).toBe("");
    }
  });
});

describe.each(["searchIssues", "listPullRequests"] as const)("%s", (method) => {
  const seg = method === "searchIssues" ? "issues" : "pull-requests";

  it.each([
    ["a/b", "a%2Fb"],
    ["a?b=1", "a%3Fb%3D1"],
    ["a b", "a%20b"],
  ])("encodes teamId %j as %s and keeps the path segment", async (id, enc) => {
    fetchMock.mockResolvedValue(json(page([])));
    await createApiClient()[method](id, {} as never);
    const raw = String(fetchMock.mock.calls[0][0]);
    expect(raw).toContain(`/teams/${enc}/${seg}`);
    expect(new URL(raw).search).toBe("");
  });

  it("passes query params through and omits undefined ones", async () => {
    fetchMock.mockResolvedValue(json(page([])));
    const q =
      method === "searchIssues"
        ? {
            q: "login bug",
            state: "OPEN",
            priority: "HIGH",
            label: "bug",
            limit: 5,
            offset: 10,
          }
        : { state: "OPEN", limit: 5, offset: 10, author: undefined };
    await createApiClient()[method]("t1", q as never);
    const u = urlOf(0);
    expect(u.pathname).toBe(`/teams/t1/${seg}`);
    for (const [k, v] of Object.entries(q)) {
      if (v === undefined) expect(u.searchParams.has(k)).toBe(false);
      else expect(u.searchParams.get(k)).toBe(String(v));
    }
    expect(u.searchParams.has("undefined")).toBe(false);
  });

  it("encodes special characters in query values", async () => {
    fetchMock.mockResolvedValue(json(page([])));
    await createApiClient()[method]("t1", {
      q: "a&b=c d#e",
      label: "x&y",
    } as never);
    const u = urlOf(0);
    if (method === "searchIssues") {
      expect(u.searchParams.get("q")).toBe("a&b=c d#e");
      expect(u.searchParams.get("label")).toBe("x&y");
    }
    expect(u.hash).toBe("");
  });

  it("returns the parsed Page", async () => {
    const body = page([{ id: "z" }], 1, 20, 0);
    fetchMock.mockResolvedValue(json(body));
    await expect(
      createApiClient()[method]("t1", {} as never),
    ).resolves.toMatchObject(body);
  });
});

describe("errors", () => {
  const calls: [
    string,
    (api: ReturnType<typeof createApiClient>) => Promise<unknown>,
  ][] = [
    ["listTeams", (a) => a.listTeams()],
    ["teamOverview", (a) => a.teamOverview("t1")],
    ["searchIssues", (a) => a.searchIssues("t1", {} as never)],
    ["listPullRequests", (a) => a.listPullRequests("t1", {} as never)],
  ];

  it.each(calls)(
    "%s rejects on non-2xx without leaking the body",
    async (_n, run) => {
      fetchMock.mockImplementation(async () =>
        json(
          { error: BODY_LEAK, stack: `at ${BODY_LEAK}`, token: SECRET },
          500,
        ),
      );
      const err = (await run(createApiClient()).catch((e) => e)) as Error;
      expect(err).toBeInstanceOf(Error);
      const dump = `${err.message}\n${err.stack}\n${JSON.stringify(err, Object.getOwnPropertyNames(err))}`;
      expect(dump).not.toContain(BODY_LEAK);
      expect(dump).not.toContain(SECRET);
    },
  );

  it.each(calls)("%s rejects on 404 and 400 too", async (_n, run) => {
    for (const status of [400, 404]) {
      fetchMock.mockResolvedValueOnce(json({ error: BODY_LEAK }, status));
      await expect(run(createApiClient())).rejects.toBeInstanceOf(Error);
      fetchMock.mockReset();
    }
  });

  it.each(calls)(
    "%s rejects on network failure without leaking secrets",
    async (_n, run) => {
      fetchMock.mockRejectedValue(
        new TypeError(
          `fetch failed ECONNREFUSED Authorization: Bearer ${SECRET} body=${BODY_LEAK}`,
        ),
      );
      const err = (await run(createApiClient()).catch((e) => e)) as Error;
      expect(err).toBeInstanceOf(Error);
      const dump = `${err.message}\n${err.stack}\n${JSON.stringify(err, Object.getOwnPropertyNames(err))}`;
      expect(dump).not.toContain(SECRET);
      expect(dump).not.toContain(BODY_LEAK);
    },
  );
});
