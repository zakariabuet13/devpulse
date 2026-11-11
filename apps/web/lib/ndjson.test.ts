import { describe, expect, it } from "vitest";
import { parseEvent, splitLines } from "./ndjson";

describe("parseEvent", () => {
  it.each([
    [
      '{"type":"tool","name":"list_teams"}',
      { type: "tool", name: "list_teams" },
    ],
    ['{"type":"text","text":"hi"}', { type: "text", text: "hi" }],
    ['{"type":"done"}', { type: "done" }],
    ['{"type":"error","message":"oops"}', { type: "error", message: "oops" }],
  ])("parses %s", (line, event) => {
    expect(parseEvent(line)).toEqual(event);
  });

  it.each([
    ["bad JSON", "{not json"],
    ["unknown type", '{"type":"thinking","text":"x"}'],
    ["wrong field type", '{"type":"text","text":5}'],
    ["not an object", "42"],
  ])("returns null for %s", (_name, line) => {
    expect(parseEvent(line)).toBeNull();
  });
});

describe("splitLines", () => {
  it("returns multiple complete lines from one chunk", () => {
    expect(splitLines("", "a\nb\nc\n")).toEqual({
      lines: ["a", "b", "c"],
      rest: "",
    });
  });

  it("keeps a trailing partial line in rest", () => {
    expect(splitLines("", "a\nb\npart")).toEqual({
      lines: ["a", "b"],
      rest: "part",
    });
  });

  it("holds a chunk with no newline entirely in rest", () => {
    expect(splitLines("", "partial")).toEqual({ lines: [], rest: "partial" });
  });

  it("joins a line split across chunks via carry", () => {
    const first = splitLines("", '{"type":"te');
    expect(first).toEqual({ lines: [], rest: '{"type":"te' });

    const second = splitLines(first.rest, 'xt"}\n');
    expect(second).toEqual({ lines: ['{"type":"text"}'], rest: "" });
  });

  it("completes the carried line then keeps the next partial", () => {
    expect(splitLines("ab", "cd\nef")).toEqual({
      lines: ["abcd"],
      rest: "ef",
    });
  });

  it("handles a newline arriving alone in its own chunk", () => {
    expect(splitLines("a", "\n")).toEqual({ lines: ["a"], rest: "" });
  });

  it("ignores empty lines", () => {
    expect(splitLines("", "a\n\n\nb\n")).toEqual({
      lines: ["a", "b"],
      rest: "",
    });
  });

  it("ignores whitespace-only lines", () => {
    expect(splitLines("", "a\n   \nb\n")).toEqual({
      lines: ["a", "b"],
      rest: "",
    });
  });

  it("returns nothing for an empty chunk and empty carry", () => {
    expect(splitLines("", "")).toEqual({ lines: [], rest: "" });
  });

  it("preserves carry when the chunk is empty", () => {
    expect(splitLines("keep", "")).toEqual({ lines: [], rest: "keep" });
  });

  it("strips a trailing \\r from CRLF lines", () => {
    expect(splitLines("", "a\r\nb\r\n")).toEqual({
      lines: ["a", "b"],
      rest: "",
    });
  });

  it("does not split on newlines inside multi-byte characters' content", () => {
    expect(splitLines("", "héllo ✓\nnext")).toEqual({
      lines: ["héllo ✓"],
      rest: "next",
    });
  });
});
