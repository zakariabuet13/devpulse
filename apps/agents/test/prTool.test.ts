import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createPrTool } from "../src/releaseNotes/prTool";

// Assumed runGh shape: (args: string[]) => Promise<string> (stdout). Adjust with the implementation.
function fakeGh(pr: Record<string, unknown> | Error) {
  const calls: string[][] = [];
  const runGh = async (args: string[]) => {
    calls.push(args);
    if (pr instanceof Error) throw pr;
    return JSON.stringify(pr);
  };
  return { runGh, calls };
}

const text = (r: { content: { type: string; text?: string }[] }) =>
  r.content.map((c) => c.text ?? "").join("\n");

describe("get_pull_request tool", () => {
  it("is named get_pull_request, read-only and always loaded", () => {
    const def = createPrTool(fakeGh({}).runGh);
    expect(def.name).toBe("get_pull_request");
    expect(def.annotations?.readOnlyHint).toBe(true);
    expect(def._meta?.["anthropic/alwaysLoad"]).toBe(true);
  });

  it("only lets the agent choose a positive integer PR number", () => {
    const def = createPrTool(fakeGh({}).runGh);
    const schema = z.object(def.inputSchema);
    expect(Object.keys(def.inputSchema)).toEqual(["number"]);
    expect(schema.safeParse({ number: 12 }).success).toBe(true);
    for (const bad of [0, -1, 1.5, "12", "1; rm -rf /", null, undefined]) {
      expect(schema.safeParse({ number: bad }).success).toBe(false);
    }
  });

  it("found: returns title and body, calling gh via argv", async () => {
    const { runGh, calls } = fakeGh({
      number: 12,
      title: "Add board",
      body: "Adds the kanban board.",
      labels: [{ name: "feature" }],
    });
    const r = await createPrTool(runGh).handler({ number: 12 }, {});
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain("Add board");
    expect(text(r)).toContain("Adds the kanban board.");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(expect.arrayContaining(["pr", "view", "12"]));
    expect(calls[0].every((a) => typeof a === "string")).toBe(true);
  });

  it("trims a 10,000-char body to 1,500", async () => {
    const { runGh } = fakeGh({
      number: 1,
      title: "Big",
      body: "x".repeat(10_000),
      labels: [],
    });
    const out = text(await createPrTool(runGh).handler({ number: 1 }, {}));
    expect(out).toContain("x".repeat(1500));
    expect(out).not.toContain("x".repeat(1501));
  });

  it("leaves a short body untouched", async () => {
    const body = "y".repeat(1500);
    const { runGh } = fakeGh({ number: 1, title: "Edge", body, labels: [] });
    const out = text(await createPrTool(runGh).handler({ number: 1 }, {}));
    expect(out).toContain(body);
  });

  it("handles a null body", async () => {
    const { runGh } = fakeGh({
      number: 2,
      title: "No body",
      body: null,
      labels: [],
    });
    const r = await createPrTool(runGh).handler({ number: 2 }, {});
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain("No body");
  });

  it("not found: isError true, mentions the PR, leaks no stderr", async () => {
    const { runGh } = fakeGh(
      new Error(
        "GraphQL: Could not resolve to a PullRequest (token=ghp_SECRET path=C:\\Users\\x)",
      ),
    );
    const r = await createPrTool(runGh).handler({ number: 99 }, {});
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("#99");
    expect(text(r)).not.toContain("ghp_SECRET");
    expect(text(r)).not.toContain("C:\\Users");
  });

  it("malformed gh output: isError true, does not throw", async () => {
    const runGh = async () => "not json";
    const r = await createPrTool(runGh).handler({ number: 5 }, {});
    expect(r.isError).toBe(true);
  });
});
