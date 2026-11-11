import http from "node:http";
import type { AddressInfo } from "node:net";
import { inspect } from "node:util";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as shared from "@devpulse/shared";
import { createApp } from "../src/app";
import { logger } from "../src/logger";

// Spec: docs/SPEC-ask-devpulse.md (route half). Plan: docs/PLAN-ask-devpulse.md
//
// Assumed seams (the spec only names `createApp({ github, triager, assistant })`):
//   - assistant = { chat(messages, { signal }) => AsyncIterable<event> }
//   - events: { type: "tool", name } | { type: "text", text } | { type: "done" } | { type: "error", message }
//   - the assistant yields `done` itself; the route forwards events as NDJSON lines
//   - shared exports chatRequestSchema and assistantEventSchema
//   - history cap: 11 messages (5 past turns + the new question), from the plan

const userMsg = (content: string) => ({ role: "user" as const, content });
const assistantMsg = (content: string) => ({
  role: "assistant" as const,
  content,
});

const oneQuestion = { messages: [userMsg("How many open issues?")] };

type Chat = (
  messages: unknown[],
  opts: { signal: AbortSignal },
) => AsyncIterable<unknown>;

const fakeAssistant = (impl?: Chat) => ({
  chat: vi.fn<Chat>(
    impl ??
      async function* () {
        yield { type: "text", text: "ok" };
        yield { type: "done" };
      },
  ),
});

// `never` so the fake need not match the (not yet existing) Assistant type.
const appWith = (assistant: ReturnType<typeof fakeAssistant>) =>
  createApp({ assistant: assistant as never });

// supertest only buffers known content types; read the NDJSON body as text.
const post = (app: ReturnType<typeof createApp>, body: unknown) =>
  request(app)
    .post("/assistant/chat")
    .send(body as object)
    .buffer(true)
    .parse((res, cb) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => (data += c));
      // Only NDJSON stays text; JSON errors (400/503) parse into objects.
      res.on("end", () =>
        cb(
          null,
          /^application\/json/.test(res.headers["content-type"] ?? "")
            ? JSON.parse(data)
            : data,
        ),
      );
    });

const ndjson = (res: request.Response): any[] => {
  expect(typeof res.body).toBe("string");
  const text = res.body as string;
  expect(text.endsWith("\n")).toBe(true);
  const lines = text.split("\n").slice(0, -1);
  expect(lines.every((l) => l.length > 0)).toBe(true);
  return lines.map((l) => JSON.parse(l));
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("chatRequestSchema", () => {
  it("accepts one user question", () => {
    expect(shared.chatRequestSchema.safeParse(oneQuestion).success).toBe(true);
  });

  it("accepts a 2000-char question and rejects 2001 (boundary)", () => {
    const q = (n: number) => ({ messages: [userMsg("x".repeat(n))] });
    expect(shared.chatRequestSchema.safeParse(q(2000)).success).toBe(true);
    expect(shared.chatRequestSchema.safeParse(q(2001)).success).toBe(false);
  });

  it("rejects when the last message is from the assistant", () => {
    expect(
      shared.chatRequestSchema.safeParse({
        messages: [userMsg("hi"), assistantMsg("hello")],
      }).success,
    ).toBe(false);
  });
});

describe("assistantEventSchema", () => {
  it.each([
    [{ type: "tool", name: "list_teams" }],
    [{ type: "text", text: "hi" }],
    [{ type: "done" }],
    [{ type: "error", message: "Something went wrong" }],
  ])("accepts %j", (event) => {
    expect(shared.assistantEventSchema.safeParse(event).success).toBe(true);
  });

  it("rejects an unknown event type", () => {
    expect(
      shared.assistantEventSchema.safeParse({ type: "thinking", text: "x" })
        .success,
    ).toBe(false);
  });
});

describe("POST /assistant/chat", () => {
  describe("validation (400 before streaming)", () => {
    const history = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        i % 2 === 0 ? userMsg(`q${i}`) : assistantMsg(`a${i}`),
      );

    it.each([
      ["no body", undefined],
      ["body is not an object", "hello"],
      ["messages missing", {}],
      ["messages is not an array", { messages: "hi" }],
      ["messages is empty", { messages: [] }],
      ["unknown role", { messages: [{ role: "system", content: "hi" }] }],
      ["content is not a string", { messages: [{ role: "user", content: 5 }] }],
      ["content missing", { messages: [{ role: "user" }] }],
      [
        "last message is from the assistant",
        { messages: [userMsg("hi"), assistantMsg("hello")] },
      ],
      ["question is 2001 chars", { messages: [userMsg("x".repeat(2001))] }],
      [
        "12 messages (over the cap of 11)",
        { messages: history(11).concat(userMsg("one more")) },
      ],
    ])("400s with an issue list when %s", async (_name, body) => {
      const assistant = fakeAssistant();
      const res = await post(appWith(assistant), body);

      expect(res.status).toBe(400);
      expect(res.headers["content-type"]).toMatch(/json/);
      expect(res.headers["content-type"]).not.toMatch(/ndjson/);
      expect(Array.isArray(res.body.error)).toBe(true);
      expect(res.body.error.length).toBeGreaterThan(0);
      expect(assistant.chat).not.toHaveBeenCalled();
    });

    it("400s for a bad body even when no key is configured (validation before 503)", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      const res = await post(createApp(), { messages: [] });
      expect(res.status).toBe(400);
    });

    it("accepts a 2000-char question (boundary)", async () => {
      const assistant = fakeAssistant();
      const res = await post(appWith(assistant), {
        messages: [userMsg("x".repeat(2000))],
      });
      expect(res.status).toBe(200);
      expect(assistant.chat).toHaveBeenCalledTimes(1);
    });

    it("accepts 11 messages (boundary: 5 past turns + new question)", async () => {
      const assistant = fakeAssistant();
      const res = await post(appWith(assistant), {
        messages: history(10).concat(userMsg("latest")),
      });
      expect(res.status).toBe(200);
    });
  });

  it("503 'Assistant is not configured' when no assistant is injected and the key is empty", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await post(createApp(), oneQuestion);

    expect(res.status).toBe(503);
    expect(res.headers["content-type"]).not.toMatch(/ndjson/);
    expect(res.body.error.message).toBe("Assistant is not configured");
  });

  describe("streaming", () => {
    it("responds 200 application/x-ndjson with one JSON event per line, in order, valid against assistantEventSchema", async () => {
      const assistant = fakeAssistant(async function* () {
        yield { type: "tool", name: "list_teams" };
        yield { type: "text", text: "You have " };
        yield { type: "text", text: "2 teams." };
        yield { type: "done" };
      });
      const res = await post(appWith(assistant), oneQuestion);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/^application\/x-ndjson/);
      const events = ndjson(res);
      expect(events).toEqual([
        { type: "tool", name: "list_teams" },
        { type: "text", text: "You have " },
        { type: "text", text: "2 teams." },
        { type: "done" },
      ]);
      for (const e of events) {
        expect(shared.assistantEventSchema.safeParse(e).success).toBe(true);
      }
    });

    it("passes the validated history and an AbortSignal to the assistant", async () => {
      const assistant = fakeAssistant();
      const messages = [
        userMsg("first"),
        assistantMsg("answer"),
        userMsg("second"),
      ];
      await post(appWith(assistant), { messages });

      expect(assistant.chat).toHaveBeenCalledTimes(1);
      const [passed, opts] = assistant.chat.mock.calls[0];
      expect(passed).toEqual(messages);
      expect(opts.signal).toBeInstanceOf(AbortSignal);
    });

    it("sends the first event before the assistant finishes (streams, not buffers)", async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const assistant = fakeAssistant(async function* () {
        yield { type: "text", text: "early" };
        await gate;
        yield { type: "done" };
      });
      const server = appWith(assistant).listen(0);
      try {
        const port = (server.address() as AddressInfo).port;
        const firstChunk = await new Promise<string>((resolve, reject) => {
          const req = http.request(
            {
              port,
              method: "POST",
              path: "/assistant/chat",
              headers: { "content-type": "application/json" },
            },
            (res) => res.once("data", (c) => resolve(String(c))),
          );
          req.on("error", reject);
          req.end(JSON.stringify(oneQuestion));
        });
        expect(JSON.parse(firstChunk.trim().split("\n")[0])).toEqual({
          type: "text",
          text: "early",
        });
      } finally {
        release();
        server.closeAllConnections();
        server.close();
      }
    });
  });

  describe("errors after the stream starts", () => {
    it("ends with one generic error line, no done, and leaks nothing raw", async () => {
      const assistant = fakeAssistant(async function* () {
        yield { type: "text", text: "partial" };
        throw new Error(
          "401 sk-ant-SECRETKEY raw upstream body RAW-MODEL-TEXT-123",
        );
      });
      const res = await post(appWith(assistant), oneQuestion);

      expect(res.status).toBe(200);
      const events = ndjson(res);
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: "text", text: "partial" });
      expect(events[1].type).toBe("error");
      expect(typeof events[1].message).toBe("string");
      expect(events[1].message.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === "done")).toBe(false);
      expect(shared.assistantEventSchema.safeParse(events[1]).success).toBe(
        true,
      );

      const raw = res.body as string;
      expect(raw).not.toContain("SECRETKEY");
      expect(raw).not.toContain("RAW-MODEL-TEXT-123");
      expect(raw).not.toContain("upstream body");
    });

    it("a failure before any event is still one error line on a 200 stream", async () => {
      // Assumption: the stream "starts" once the request passed validation and
      // an assistant exists, so only 400/503 are real status codes.
      const assistant = fakeAssistant(async function* () {
        throw new Error("boom SECRETKEY");
      });
      const res = await post(appWith(assistant), oneQuestion);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/^application\/x-ndjson/);
      const events = ndjson(res);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      expect(res.body as string).not.toContain("SECRETKEY");
    });

    it("never logs the thrown error's message, the key, or the question text", async () => {
      const spies = (
        ["trace", "debug", "info", "warn", "error", "fatal"] as const
      ).map((level) => vi.spyOn(logger, level));
      const assistant = fakeAssistant(async function* () {
        throw new Error("sk-ant-SECRETKEY RAW-MODEL-TEXT-123");
      });
      const res = await post(appWith(assistant), {
        messages: [userMsg("QUESTION-TEXT-XYZ")],
      });
      // Precondition: the failure really went through the stream path.
      expect(res.status).toBe(200);
      expect(assistant.chat).toHaveBeenCalledTimes(1);

      // inspect, not JSON.stringify: pino-http logs objects with circular refs.
      const logged = inspect(
        spies.flatMap((s) => s.mock.calls),
        { depth: 3, maxStringLength: null },
      );
      expect(logged).not.toContain("SECRETKEY");
      expect(logged).not.toContain("RAW-MODEL-TEXT-123");
      expect(logged).not.toContain("QUESTION-TEXT-XYZ");
    });
  });

  describe("client disconnect", () => {
    it("aborts the signal passed to the assistant", async () => {
      let signal: AbortSignal | undefined;
      const assistant = fakeAssistant(async function* (_m, opts) {
        signal = opts.signal;
        yield { type: "text", text: "first" };
        await new Promise<void>((resolve) => {
          if (opts.signal.aborted) return resolve();
          opts.signal.addEventListener("abort", () => resolve());
        });
      });
      const server = appWith(assistant).listen(0);
      try {
        const port = (server.address() as AddressInfo).port;
        await new Promise<void>((resolve) => {
          const req = http.request(
            {
              port,
              method: "POST",
              path: "/assistant/chat",
              headers: { "content-type": "application/json" },
            },
            (res) =>
              res.once("data", () => {
                req.destroy();
                resolve();
              }),
          );
          req.on("error", () => {});
          req.end(JSON.stringify(oneQuestion));
        });

        await vi.waitFor(() => {
          expect(signal).toBeDefined();
          expect(signal!.aborted).toBe(true);
        });
      } finally {
        server.closeAllConnections();
        server.close();
      }
    });

    it("does not abort the signal when the stream completes normally", async () => {
      const assistant = fakeAssistant();
      const res = await post(appWith(assistant), oneQuestion);
      expect(res.status).toBe(200);
      expect(assistant.chat.mock.calls[0][1].signal.aborted).toBe(false);
    });
  });
});
