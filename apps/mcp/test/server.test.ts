import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "../src/server.js";

const SECRET = "SECRET-TOKEN-123";
const BODY_LEAK = "RESPONSE-BODY-LEAK";

const team = { id: "t1", name: "Core", createdAt: "2026-01-01T00:00:00.000Z" };
const issue = {
  id: "i1",
  repositoryId: "REPO-ID-XYZ",
  number: 7,
  title: "Login button broken",
  state: "OPEN",
  labels: ["bug"],
  priority: "HIGH",
  aiSummary: "AI-SUMMARY-TEXT",
  githubCreatedAt: "2026-02-01T00:00:00.000Z",
};
const pr = {
  id: "p1",
  repositoryId: "r1",
  number: 3,
  title: "Fix login",
  state: "OPEN",
  author: "alice",
  reviewRequestedAt: null,
  mergedAt: null,
};
const overview = {
  team,
  stats: {
    openIssuesByPriority: { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 },
    openPullRequests: 4,
    mergedLast7Days: 5,
  },
  repositories: [{ id: "r1", teamId: "t1", githubFullName: "acme/web" }],
};
const page = <T>(items: T[]) => ({
  items,
  total: items.length,
  limit: 20,
  offset: 0,
});

// Fake DevPulseApi; every method is a spy so tests can assert on the arguments.
function fakeApi() {
  return {
    listTeams: vi.fn(async () => [team]),
    teamOverview: vi.fn(async () => overview),
    searchIssues: vi.fn(async () => page([issue])),
    listPullRequests: vi.fn(async () => page([pr])),
  };
}

const cleanups: Array<() => Promise<void>> = [];

// In-process: the Client's HTTP transport uses a custom fetch that calls the handler directly,
// so no socket is opened.
async function connect(api: ReturnType<typeof fakeApi>) {
  const handler = createMcpHandler(() => createServer({ api: api as never }));
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost/mcp"),
    {
      fetch: (input, init) => handler.fetch(new Request(input, init)),
    },
  );
  await client.connect(transport);
  cleanups.push(async () => {
    await client.close();
    await handler.close();
  });
  return client;
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function textOf(result: { content?: unknown }): string {
  const parts = (result.content ?? []) as Array<{
    type: string;
    text?: string;
  }>;
  return parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("\n");
}

describe("server metadata", () => {
  it("instructions are under 1000 chars and say titles are user content", async () => {
    const client = await connect(fakeApi());
    const instructions = client.getInstructions() ?? "";
    expect(instructions.length).toBeGreaterThan(0);
    expect(instructions.length).toBeLessThan(1000);
    expect(instructions).toMatch(/titles?\b[^.]*user/i);
  });

  it("exposes exactly the four tools", async () => {
    const client = await connect(fakeApi());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "list_pull_requests",
      "list_teams",
      "search_issues",
      "team_overview",
    ]);
  });

  it("every tool is readOnlyHint and has a description", async () => {
    const client = await connect(fakeApi());
    const { tools } = await client.listTools();
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(t.description?.length ?? 0, t.name).toBeGreaterThan(0);
    }
  });

  it("every tool argument has a description", async () => {
    const client = await connect(fakeApi());
    const { tools } = await client.listTools();
    for (const t of tools) {
      const props = (t.inputSchema.properties ?? {}) as Record<
        string,
        { description?: string }
      >;
      for (const [name, schema] of Object.entries(props)) {
        expect(schema.description, `${t.name}.${name}`).toBeTruthy();
      }
    }
  });

  it("tools needing teamId have it required and point to list_teams", async () => {
    const client = await connect(fakeApi());
    const { tools } = await client.listTools();
    for (const name of [
      "team_overview",
      "search_issues",
      "list_pull_requests",
    ]) {
      const t = tools.find((x) => x.name === name)!;
      expect(t.inputSchema.required, name).toContain("teamId");
      const teamIdDesc = (
        t.inputSchema.properties as Record<string, { description?: string }>
      ).teamId?.description;
      expect(`${t.description} ${teamIdDesc}`, name).toMatch(/list_teams/);
    }
  });
});

describe("list_teams", () => {
  it("returns teams as JSON", async () => {
    const api = fakeApi();
    const client = await connect(api);
    const res = await client.callTool({ name: "list_teams", arguments: {} });
    expect(res.isError).toBeFalsy();
    const text = textOf(res);
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text).toContain("t1");
    expect(text).toContain("Core");
    expect(api.listTeams).toHaveBeenCalledTimes(1);
  });
});

describe("team_overview", () => {
  it("returns team, stats and repositories as JSON", async () => {
    const api = fakeApi();
    const client = await connect(api);
    const res = await client.callTool({
      name: "team_overview",
      arguments: { teamId: "t1" },
    });
    expect(res.isError).toBeFalsy();
    expect(api.teamOverview).toHaveBeenCalledWith("t1");
    const body = JSON.parse(textOf(res));
    expect(body).toHaveProperty("team");
    expect(body).toHaveProperty("stats");
    expect(body).toHaveProperty("repositories");
    expect(body.stats.mergedLast7Days).toBe(5);
    expect(body.repositories[0].githubFullName).toBe("acme/web");
  });

  it("rejects a call with no teamId without calling the API", async () => {
    const api = fakeApi();
    const client = await connect(api);
    const outcome = await client
      .callTool({ name: "team_overview", arguments: {} })
      .then((r) => ({ isError: r.isError === true }))
      .catch(() => ({ isError: true }));
    expect(outcome.isError).toBe(true);
    expect(api.teamOverview).not.toHaveBeenCalled();
  });
});

describe("search_issues", () => {
  it("passes teamId and filters to the API", async () => {
    const api = fakeApi();
    const client = await connect(api);
    await client.callTool({
      name: "search_issues",
      arguments: {
        teamId: "t1",
        q: "login",
        state: "OPEN",
        priority: "HIGH",
        label: "bug",
        limit: 5,
      },
    });
    expect(api.searchIssues).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({
        q: "login",
        state: "OPEN",
        priority: "HIGH",
        label: "bug",
        limit: 5,
      }),
    );
  });

  it("returns JSON with the title and page info", async () => {
    const client = await connect(fakeApi());
    const res = await client.callTool({
      name: "search_issues",
      arguments: { teamId: "t1" },
    });
    expect(res.isError).toBeFalsy();
    const text = textOf(res);
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text).toContain("Login button broken");
    expect(text).toContain("total");
  });

  it("omits aiSummary and repositoryId", async () => {
    const client = await connect(fakeApi());
    const res = await client.callTool({
      name: "search_issues",
      arguments: { teamId: "t1" },
    });
    const text = textOf(res);
    expect(text).not.toContain("aiSummary");
    expect(text).not.toContain("AI-SUMMARY-TEXT");
    expect(text).not.toContain("repositoryId");
    expect(text).not.toContain("REPO-ID-XYZ");
    expect(JSON.stringify(res.structuredContent ?? {})).not.toMatch(
      /aiSummary|repositoryId/,
    );
  });
});

describe("list_pull_requests", () => {
  it("passes teamId, state and limit to the API", async () => {
    const api = fakeApi();
    const client = await connect(api);
    await client.callTool({
      name: "list_pull_requests",
      arguments: { teamId: "t1", state: "MERGED", limit: 10 },
    });
    expect(api.listPullRequests).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ state: "MERGED", limit: 10 }),
    );
  });

  it("returns pull requests as JSON", async () => {
    const client = await connect(fakeApi());
    const res = await client.callTool({
      name: "list_pull_requests",
      arguments: { teamId: "t1" },
    });
    expect(res.isError).toBeFalsy();
    const text = textOf(res);
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text).toContain("Fix login");
    expect(text).toContain("alice");
  });
});

describe("API failures", () => {
  const calls = [
    ["list_teams", {}],
    ["team_overview", { teamId: "t1" }],
    ["search_issues", { teamId: "t1" }],
    ["list_pull_requests", { teamId: "t1" }],
  ] as const;

  it.each(calls)(
    "%s returns isError with a fix hint and leaks nothing",
    async (name, args) => {
      const api = fakeApi();
      const boom = () => {
        const err = new Error(
          `connect ECONNREFUSED 127.0.0.1:4000 Authorization: Bearer ${SECRET} body=${BODY_LEAK}`,
        );
        err.stack = `Error: boom\n    at secretFrame (/srv/app/internal.ts:1:1) ${SECRET}`;
        return Promise.reject(err);
      };
      api.listTeams.mockImplementation(boom);
      api.teamOverview.mockImplementation(boom);
      api.searchIssues.mockImplementation(boom);
      api.listPullRequests.mockImplementation(boom);

      const client = await connect(api);
      const res = await client.callTool({ name, arguments: { ...args } });
      expect(res.isError).toBe(true);
      const text = textOf(res);
      expect(text).toMatch(/start|running|check/i);
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(BODY_LEAK);
      expect(text).not.toMatch(/\n\s+at /);
      expect(text).not.toContain("internal.ts");
    },
  );
});

describe("resource devpulse://teams/{teamId}/overview", () => {
  it("is registered as a template", async () => {
    const client = await connect(fakeApi());
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((r) => r.uriTemplate)).toContain(
      "devpulse://teams/{teamId}/overview",
    );
  });

  it("list callback lists one resource per team", async () => {
    const api = fakeApi();
    const client = await connect(api);
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain(
      "devpulse://teams/t1/overview",
    );
    expect(api.listTeams).toHaveBeenCalled();
  });

  it("reads the overview for a team", async () => {
    const api = fakeApi();
    const client = await connect(api);
    const res = await client.readResource({
      uri: "devpulse://teams/t1/overview",
    });
    expect(api.teamOverview).toHaveBeenCalledWith("t1");
    const text = (res.contents[0] as { text?: string }).text ?? "";
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text).toContain("acme/web");
  });
});

describe("prompt standup", () => {
  it("is registered with a teamId argument", async () => {
    const client = await connect(fakeApi());
    const { prompts } = await client.listPrompts();
    const standup = prompts.find((p) => p.name === "standup");
    expect(standup).toBeDefined();
    expect(standup!.arguments?.map((a) => a.name)).toContain("teamId");
  });

  it("returns at least one user message", async () => {
    const client = await connect(fakeApi());
    const res = await client.getPrompt({
      name: "standup",
      arguments: { teamId: "t1" },
    });
    expect(res.messages.length).toBeGreaterThan(0);
    expect(res.messages[0].role).toBe("user");
    expect(res.messages[0].content.type).toBe("text");
  });
});
