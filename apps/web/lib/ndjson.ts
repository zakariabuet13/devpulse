import { assistantEventSchema, type AssistantEvent } from "@devpulse/shared";

// One NDJSON line -> a validated event, or null for bad JSON / unknown shapes (ignored by callers).
export function parseEvent(line: string): AssistantEvent | null {
  try {
    const result = assistantEventSchema.safeParse(JSON.parse(line));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// Splits a streamed NDJSON body into complete lines.
// `carry` is the unfinished tail from the previous chunk; `rest` is the new unfinished tail.
// Blank lines are dropped and a trailing "\r" (CRLF) is stripped.
export function splitLines(
  carry: string,
  chunk: string,
): { lines: string[]; rest: string } {
  const parts = (carry + chunk).split("\n");
  const rest = parts.pop() ?? "";
  const lines = parts
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim() !== "");
  return { lines, rest };
}
