import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../src/logger";

// Spec: docs/SPEC-ask-devpulse.md (adapter half). Plan: docs/PLAN-ask-devpulse.md
//
// Assumed seams:
//   - createClaudeAssistant({ client }) and createAssistantFromEnv() exported from
//     src/ai/claudeAssistant.ts
//   - assistant.chat(messages, { signal }) -> AsyncIterable of
//     { type: "tool", name } | { type: "text", text } | { type: "done" }
//   - SDK/upstream failures make the iterable THROW a generic Error (the route turns
//     that into the `error` line); the adapter never yields `error` itself
//   - tools reach the REST API through global fetch (loopback), stubbed here; the
//     Anthropic client gets its own fake fetch, so neither touches the network

const API_KEY = "sk-ant-test-key-123";
const TOOL_NAMES = [
  "list_teams",
  "search_issues",
  "list_pull_requests",
  "team_stats",
];

type Captured = { url: string; body: any; signal?: AbortSignal };

const sse = (events: { type: string; [k: string]: unknown }[]) =>
  events
    .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join("");

const sseResponse = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/event-stream" },
  });

type Usage = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
};

const startEvent = (u: Usage = {}) => ({
  type: "message_start",
  message: {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: {
      input_tokens: u.input ?? 10,
      output_tokens: 1,
      cache_creation_input_tokens: u.cacheWrite ?? 0,
      cache_read_input_tokens: u.cacheRead ?? 0,
    },
  },
});

const endEvents = (stop: string, u: Usage = {}) => [
  {
    type: "message_delta",
    delta: { stop_reason: stop, stop_sequence: null },
    usage: { output_tokens: u.output ?? 5 },
  },
  { type: "message_stop" },
];

function textRound(chunks: string[], u: Usage = {}, stop = "end_turn") {
  return sseResponse(
    sse([
      startEvent(u),
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
      ...chunks.map((text) => ({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text },
      })),
      { type: "content_block_stop", index: 0 },
      ...endEvents(stop, u),
    ]),
  );
}

function toolRound(id: string, name: string, input: object, u: Usage = {}) {
  return sseResponse(
    sse([
      startEvent(u),
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id, name, input: {} },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: JSON.stringify(input),
        },
      },
      { type: "content_block_stop", index: 0 },
      ...endEvents("tool_use", u),
    ]),
  );
}

async function makeAssistant(
  handler: (req: Captured, n: number) => Response | Promise<Response>,
) {
  const calls: Captured[] = [];
  const fetchFake = async (url: any, init?: any) => {
    const call: Captured = {
      url: String(url),
      body: JSON.parse(String(init?.body)),
      signal: init?.signal,
    };
    calls.push(call);
    const abort = new Promise<never>((_, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      );
    });
    return Promise.race([
      Promise.resolve(handler(call, calls.length - 1)),
      abort,
    ]);
  };
  const client = new Anthropic({
    apiKey: API_KEY,
    fetch: fetchFake as any,
    maxRetries: 0,
  });
  const { createClaudeAssistant } = await import("../src/ai/claudeAssistant");
  return { assistant: createClaudeAssistant({ client }), calls };
}

const q = (content: string) => [{ role: "user" as const, content }];

async function collect(
  assistant: { chat: (...a: any[]) => AsyncIterable<any> },
  messages: unknown[] = q("How many teams?"),
  signal: AbortSignal = new AbortController().signal,
) {
  const events: any[] = [];
  for await (const e of assistant.chat(messages, { signal })) events.push(e);
  return events;
}

const textOf = (content: unknown): string =>
  typeof content === "string"
    ? content
    : (content as { text?: string }[]).map((b) => b.text ?? "").join("\n");

const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
const spyLogger = () => LEVELS.map((l) => vi.spyOn(logger, l));
const allLogged = (spies: ReturnType<typeof spyLogger>) =>
  JSON.stringify(spies.flatMap((s) => s.mock.calls));

// Loopback REST used by the tools; keep it tiny and offline.
const stubRest = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ items: [], total: 0, limit: 20, offset: 0 }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    ),
  );

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("createClaudeAssistant", () => {
  describe("request shape", () => {
    it("sends model, max_tokens, effort and streaming", async () => {
      const { assistant, calls } = await makeAssistant(() => textRound(["hi"]));
      await collect(assistant);

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("/v1/messages");
      expect(calls[0].body).toMatchObject({
        model: "claude-haiku-5-5",
        max_tokens: 4096,
        stream: true,
        output_config: { effort: "low" },
      });
    });

    it("puts cache_control on the last system block AND at the top level", async () => {
      const { assistant, calls } = await makeAssistant(() => textRound(["hi"]));
      await collect(assistant);

      const system = calls[0].body.system;
      expect(Array.isArray(system)).toBe(true);
      expect(system.at(-1)).toMatchObject({
        type: "text",
        cache_control: { type: "ephemeral" },
      });
      expect(calls[0].body.cache_control).toEqual({ type: "ephemeral" });
    });

    it("sends the 4 tools in a fixed order, each with a non-trivial description", async () => {
      const { assistant, calls } = await makeAssistant(() => textRound(["hi"]));
      await collect(assistant);

      const tools = calls[0].body.tools as {
        name: string;
        description: string;
        input_schema: unknown;
      }[];
      expect(tools.map((t) => t.name)).toEqual(TOOL_NAMES);
      for (const t of tools) {
        expect(t.description.length).toBeGreaterThan(20);
        expect(t.description).toMatch(/\b(use|call|when)\b/i);
        expect(t.input_schema).toBeTruthy();
      }
    });

    it("forwards the conversation history in order", async () => {
      const { assistant, calls } = await makeAssistant(() => textRound(["hi"]));
      await collect(assistant, [
        { role: "user", content: "FIRST-Q" },
        { role: "assistant", content: "FIRST-A" },
        { role: "user", content: "SECOND-Q" },
      ]);

      const msgs = calls[0].body.messages;
      expect(msgs.map((m: any) => m.role)).toEqual([
        "user",
        "assistant",
        "user",
      ]);
      expect(msgs.map((m: any) => textOf(m.content))).toEqual([
        "FIRST-Q",
        "FIRST-A",
        "SECOND-Q",
      ]);
    });

    it("system prompt calls tool results third-party data, not instructions, and holds no timestamp, id or user data", async () => {
      const { assistant, calls } = await makeAssistant(() => textRound(["hi"]));
      await collect(assistant, q("UNIQUE-QUESTION-XYZ"));

      const system = textOf(calls[0].body.system);
      expect(system).toMatch(/tool/i);
      expect(system).toMatch(/data/i);
      expect(system).toMatch(/third.part/i);
      expect(system).toMatch(/instruction/i);
      expect(system).not.toContain("UNIQUE-QUESTION-XYZ");
      expect(system).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(system).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
      expect(system).not.toMatch(/\bc[a-z0-9]{24}\b/); // cuid
    });

    it("system prompt and tools are identical across questions and across rounds (cache-stable)", async () => {
      stubRest();
      const { assistant, calls } = await makeAssistant((_r, n) =>
        n === 0 ? toolRound("toolu_1", "list_teams", {}) : textRound(["done"]),
      );
      await collect(assistant, q("one"));
      await collect(assistant, q("two"));

      // calls: q1 round1, q1 round2, q2 round1, q2 round2 (round 2 only if tool ran)
      expect(calls.length).toBeGreaterThanOrEqual(3);
      for (const c of calls.slice(1)) {
        expect(c.body.system).toEqual(calls[0].body.system);
        expect(c.body.tools).toEqual(calls[0].body.tools);
      }
    });
  });

  describe("event mapping", () => {
    it("plain answer: one text event per delta, then done", async () => {
      const { assistant } = await makeAssistant(() => textRound(["Hel", "lo"]));
      const events = await collect(assistant);

      expect(events).toEqual([
        { type: "text", text: "Hel" },
        { type: "text", text: "lo" },
        { type: "done" },
      ]);
    });

    it("tool round-trip: tool, then text, then done; result is sent back as tool_result", async () => {
      stubRest();
      const { assistant, calls } = await makeAssistant((_r, n) =>
        n === 0
          ? toolRound("toolu_abc", "list_teams", {})
          : textRound(["You have none."]),
      );
      const events = await collect(assistant);

      expect(events).toEqual([
        { type: "tool", name: "list_teams" },
        { type: "text", text: "You have none." },
        { type: "done" },
      ]);
      expect(calls).toHaveLength(2);
      const last = calls[1].body.messages.at(-1);
      expect(last.role).toBe("user");
      expect(last.content).toEqual([
        expect.objectContaining({
          type: "tool_result",
          tool_use_id: "toolu_abc",
        }),
      ]);
    });

    it("emits `tool` as soon as the tool_use block starts, before the tool runs (round 1 ends first)", async () => {
      stubRest();
      const { assistant } = await makeAssistant((_r, n) =>
        n === 0
          ? toolRound("toolu_1", "team_stats", { teamId: "t1" })
          : textRound(["ok"]),
      );
      const events = await collect(assistant);
      expect(events[0]).toEqual({ type: "tool", name: "team_stats" });
    });

    it("never emits tool-result data or thinking to the caller", async () => {
      stubRest();
      const { assistant } = await makeAssistant((_r, n) =>
        n === 0 ? toolRound("toolu_1", "list_teams", {}) : textRound(["ok"]),
      );
      const events = await collect(assistant);
      for (const e of events) {
        expect(["tool", "text", "done"]).toContain(e.type);
      }
      expect(events.at(-1)).toEqual({ type: "done" });
      expect(events.filter((e) => e.type === "done")).toHaveLength(1);
    });
  });

  describe("round cap", () => {
    it("stops after 5 rounds, asks for a more specific query, then done", async () => {
      stubRest();
      const { assistant, calls } = await makeAssistant((_r, n) =>
        toolRound(`toolu_${n}`, "list_teams", {}),
      );
      const events = await collect(assistant);

      expect(calls).toHaveLength(5);
      const texts = events.filter((e) => e.type === "text");
      expect(texts.length).toBeGreaterThan(0);
      expect(texts.map((e) => e.text).join("")).toMatch(/specific/i);
      expect(events.at(-1)).toEqual({ type: "done" });
      // text comes after the last tool event
      const lastTool = events.map((e) => e.type).lastIndexOf("tool");
      expect(
        events.map((e) => e.type).indexOf("text", lastTool),
      ).toBeGreaterThan(lastTool);
    });

    it("an answer on round 5 is not replaced by the cap message (boundary)", async () => {
      stubRest();
      const { assistant, calls } = await makeAssistant((_r, n) =>
        n < 4
          ? toolRound(`toolu_${n}`, "list_teams", {})
          : textRound(["FINAL-ANSWER"]),
      );
      const events = await collect(assistant);

      expect(calls).toHaveLength(5);
      const text = events
        .filter((e) => e.type === "text")
        .map((e) => e.text)
        .join("");
      expect(text).toBe("FINAL-ANSWER");
      expect(events.at(-1)).toEqual({ type: "done" });
    });
  });

  describe("logging", () => {
    it("logs usage per round at info (input, output, cache read, cache write) and the round count", async () => {
      stubRest();
      const info = vi.spyOn(logger, "info");
      const { assistant } = await makeAssistant((_r, n) =>
        n === 0
          ? toolRound(
              "toolu_1",
              "list_teams",
              {},
              {
                input: 1111,
                output: 222,
                cacheRead: 3333,
                cacheWrite: 444,
              },
            )
          : textRound(["ok"], {
              input: 5555,
              output: 666,
              cacheRead: 7777,
              cacheWrite: 88,
            }),
      );
      await collect(assistant);

      const logged = info.mock.calls.map((c) => JSON.stringify(c));
      const hasAll = (nums: number[]) =>
        logged.some((l) => nums.every((n) => l.includes(String(n))));
      expect(hasAll([1111, 222, 3333, 444])).toBe(true);
      expect(hasAll([5555, 666, 7777, 88])).toBe(true);
      // Round count per question: a log object with a key like `rounds` equal to 2.
      const hasRounds = info.mock.calls.some(([obj]) =>
        Object.entries((obj ?? {}) as Record<string, unknown>).some(
          ([k, v]) => /round/i.test(k) && v === 2,
        ),
      );
      expect(hasRounds).toBe(true);
    });

    it("never logs the key, message text, model text, or raw upstream errors (success path)", async () => {
      stubRest();
      const spies = spyLogger();
      const { assistant } = await makeAssistant((_r, n) =>
        n === 0
          ? toolRound("toolu_1", "list_teams", {})
          : textRound(["MODEL-TEXT-XYZ"]),
      );
      await collect(assistant, q("QUESTION-TEXT-XYZ"));

      const logged = allLogged(spies);
      expect(logged.length).toBeGreaterThan(2); // something was logged
      expect(logged).not.toContain("QUESTION-TEXT-XYZ");
      expect(logged).not.toContain("MODEL-TEXT-XYZ");
      expect(logged).not.toContain(API_KEY);
    });

    it("never logs the key, message text or upstream body when the call fails", async () => {
      const spies = spyLogger();
      const { assistant } = await makeAssistant(
        () =>
          new Response(
            JSON.stringify({
              type: "error",
              error: { type: "api_error", message: "UPSTREAM-BODY-123" },
            }),
            { status: 500, headers: { "content-type": "application/json" } },
          ),
      );
      await collect(assistant, q("QUESTION-TEXT-XYZ")).catch(() => {});

      const logged = allLogged(spies);
      expect(logged).not.toContain("QUESTION-TEXT-XYZ");
      expect(logged).not.toContain("UPSTREAM-BODY-123");
      expect(logged).not.toContain(API_KEY);
    });
  });

  describe("errors (thrown generic, nothing raw leaks)", () => {
    const leaks = (err: unknown) => {
      expect(err).toBeInstanceOf(Error);
      const dump = `${(err as Error).name}\n${(err as Error).message}\n${(err as Error).stack}`;
      expect(dump).not.toContain("UPSTREAM-BODY-123");
      expect(dump).not.toContain("RAW-MODEL-TEXT-123");
      expect(dump).not.toContain(API_KEY);
    };

    it.each([400, 401, 429, 500, 529])(
      "rejects on upstream HTTP %i",
      async (status) => {
        const { assistant } = await makeAssistant(
          () =>
            new Response(
              JSON.stringify({
                type: "error",
                error: { type: "api_error", message: "UPSTREAM-BODY-123" },
              }),
              { status, headers: { "content-type": "application/json" } },
            ),
        );
        const err = await collect(assistant).then(
          () => null,
          (e: unknown) => e,
        );
        leaks(err);
      },
    );

    it("rejects on an SSE error event mid-stream, keeping text already yielded", async () => {
      const { assistant } = await makeAssistant(() =>
        sseResponse(
          sse([
            startEvent(),
            {
              type: "content_block_start",
              index: 0,
              content_block: { type: "text", text: "" },
            },
            {
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: "partial" },
            },
            {
              type: "error",
              error: { type: "overloaded_error", message: "UPSTREAM-BODY-123" },
            },
          ]),
        ),
      );
      const seen: any[] = [];
      let err: unknown = null;
      try {
        for await (const e of assistant.chat(q("hi"), {
          signal: new AbortController().signal,
        }))
          seen.push(e);
      } catch (e) {
        err = e;
      }
      leaks(err);
      expect(seen.some((e) => e.type === "done")).toBe(false);
    });

    it("rejects when the stream ends with stop_reason refusal", async () => {
      const { assistant } = await makeAssistant(() =>
        textRound(["RAW-MODEL-TEXT-123"], {}, "refusal"),
      );
      const seen: any[] = [];
      let err: unknown = null;
      try {
        for await (const e of assistant.chat(q("hi"), {
          signal: new AbortController().signal,
        }))
          seen.push(e);
      } catch (e) {
        err = e;
      }
      leaks(err);
      expect(seen.some((e) => e.type === "done")).toBe(false);
    });

    it("rejects when the stream is cut off before message_stop", async () => {
      const { assistant } = await makeAssistant(() =>
        sseResponse(
          sse([
            startEvent(),
            {
              type: "content_block_start",
              index: 0,
              content_block: { type: "text", text: "" },
            },
            {
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: "cut" },
            },
          ]),
        ),
      );
      const seen: any[] = [];
      let err: unknown = null;
      try {
        for await (const e of assistant.chat(q("hi"), {
          signal: new AbortController().signal,
        }))
          seen.push(e);
      } catch (e) {
        err = e;
      }
      leaks(err);
      expect(seen.some((e) => e.type === "done")).toBe(false);
    });
  });

  describe("abort", () => {
    it("aborts the in-flight Claude request when the caller's signal aborts", async () => {
      const { assistant, calls } = await makeAssistant(
        () => new Promise<Response>(() => {}),
      );
      const controller = new AbortController();
      const run = collect(assistant, q("hi"), controller.signal).then(
        () => "finished",
        () => "rejected",
      );

      await vi.waitFor(() => expect(calls).toHaveLength(1));
      controller.abort();
      await run;

      expect(calls[0].signal?.aborted).toBe(true);
    });

    it("makes no Claude request when the signal is already aborted", async () => {
      const { assistant, calls } = await makeAssistant(() => textRound(["hi"]));
      const controller = new AbortController();
      controller.abort();
      await collect(assistant, q("hi"), controller.signal).catch(() => {});

      expect(calls.every((c) => c.signal?.aborted)).toBe(true);
    });
  });
});

describe("createAssistantFromEnv", () => {
  it("returns undefined when ANTHROPIC_API_KEY is empty", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { createAssistantFromEnv } =
      await import("../src/ai/claudeAssistant");
    expect(createAssistantFromEnv()).toBeUndefined();
  });

  it("returns an assistant with chat() when a key is set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", API_KEY);
    const { createAssistantFromEnv } =
      await import("../src/ai/claudeAssistant");
    const assistant = createAssistantFromEnv();
    expect(typeof assistant?.chat).toBe("function");
  });
});
