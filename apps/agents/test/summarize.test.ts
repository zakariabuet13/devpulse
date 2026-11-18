import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { summarize } from "../src/releaseNotes/summarize";

// Recorded real run (haiku, read-only repo question): 36 messages, 16 assistant messages
// sharing 5 distinct message ids, 12 tool_use blocks (Glob 5, Grep 6, Read 1), 13 turns.
const messages = readFileSync(
  new URL("./fixtures/hello-run.jsonl", import.meta.url),
  "utf8",
)
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l));

describe("summarize (recorded run)", () => {
  const s = summarize(messages);

  it("reports the result subtype and turns", () => {
    expect(s.subtype).toBe("success");
    expect(s.turns).toBe(13);
  });

  it("takes cost from the result message only", () => {
    expect(s.costUsd).toBeCloseTo(0.00206852, 8);
  });

  it("reports per-model tokens from modelUsage", () => {
    expect(s.modelUsage["claude-haiku-5-5"]).toMatchObject({
      inputTokens: 1205,
      outputTokens: 1877,
    });
  });

  it("counts tool calls by name, once per tool_use block", () => {
    expect(s.toolCalls).toEqual({ Glob: 5, Grep: 6, Read: 1 });
  });

  it("reports permission denials (none in this run)", () => {
    expect(s.permissionDenials).toEqual([]);
  });
});

describe("summarize (synthetic)", () => {
  const assistant = (id: string, blocks: unknown[]) => ({
    type: "assistant",
    message: { id, role: "assistant", content: blocks },
  });
  const result = (extra: Record<string, unknown> = {}) => ({
    type: "result",
    subtype: "success",
    is_error: false,
    num_turns: 2,
    total_cost_usd: 0.01,
    modelUsage: {},
    permission_denials: [],
    ...extra,
  });

  it("counts a tool_use block once even if its message id repeats (streamed in parts)", () => {
    const block = { type: "tool_use", id: "toolu_1", name: "Read", input: {} };
    const s = summarize([
      assistant("msg_1", [block]),
      assistant("msg_1", [block]),
      result(),
    ]);
    expect(s.toolCalls).toEqual({ Read: 1 });
  });

  it("counts the same tool in different blocks separately", () => {
    const s = summarize([
      assistant("msg_1", [
        {
          type: "tool_use",
          id: "t1",
          name: "mcp__notes__get_pull_request",
          input: {},
        },
      ]),
      assistant("msg_2", [
        {
          type: "tool_use",
          id: "t2",
          name: "mcp__notes__get_pull_request",
          input: {},
        },
      ]),
      result(),
    ]);
    expect(s.toolCalls).toEqual({ mcp__notes__get_pull_request: 2 });
  });

  it("counts StructuredOutput as its own tool name", () => {
    const s = summarize([
      assistant("msg_1", [
        { type: "tool_use", id: "t1", name: "StructuredOutput", input: {} },
      ]),
      result(),
    ]);
    expect(s.toolCalls).toEqual({ StructuredOutput: 1 });
  });

  it("ignores non-tool blocks and non-assistant messages", () => {
    const s = summarize([
      { type: "system", subtype: "init" },
      assistant("msg_1", [
        { type: "text", text: "hi" },
        { type: "thinking", thinking: "" },
      ]),
      { type: "user", message: { content: [] } },
      result(),
    ]);
    expect(s.toolCalls).toEqual({});
  });

  it("reports error subtypes and does not invent cost", () => {
    const s = summarize([
      assistant("msg_1", [{ type: "text", text: "x" }]),
      result({
        subtype: "error_max_budget_usd",
        is_error: true,
        total_cost_usd: 0.0512,
      }),
    ]);
    expect(s.subtype).toBe("error_max_budget_usd");
    expect(s.costUsd).toBe(0.0512);
  });

  it("passes permission_denials through", () => {
    const denial = {
      tool_name: "Read",
      tool_use_id: "t9",
      tool_input: { file_path: ".env" },
    };
    const s = summarize([result({ permission_denials: [denial] })]);
    expect(s.permissionDenials).toEqual([denial]);
  });

  it("does not crash without a result message (aborted run)", () => {
    const s = summarize([assistant("msg_1", [{ type: "text", text: "x" }])]);
    expect(s.subtype).toBeUndefined();
    expect(s.toolCalls).toEqual({});
  });

  it("never includes env or API key values", () => {
    const s = summarize([
      { type: "system", subtype: "init", apiKeySource: "ANTHROPIC_API_KEY" },
      result(),
    ]);
    expect(JSON.stringify(s)).not.toMatch(/sk-ant/);
  });
});
