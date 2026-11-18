import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/releaseNotes/args";
import { RELEASE_NOTES_CONFIG } from "../src/releaseNotes/config";
import { buildOptions } from "../src/releaseNotes/options";

const base = ["--from", "v0.1.0", "--version", "0.2.0"];

// Assumed deps shape: { repoRoot, abortController }. Adjust with the implementation.
function build(extra: string[] = []) {
  return buildOptions(parseArgs([...base, ...extra]), {
    repoRoot: "/repo",
    abortController: new AbortController(),
  });
}

describe("buildOptions", () => {
  it("uses the config constants", () => {
    const o = build();
    expect(o.model).toBe("claude-haiku-5-5");
    expect(o.effort).toBe("low");
    expect(o.maxTurns).toBe(8);
    expect(o.maxBudgetUsd).toBe(0.05);
  });

  it("gives the agent no built-in tools, only the notes MCP tool", () => {
    const o = build();
    expect(o.tools).toEqual([]);
    expect(o.allowedTools).toEqual(["mcp__notes__get_pull_request"]);
    expect(Object.keys(o.mcpServers ?? {})).toEqual(["notes"]);
  });

  it("denies .env reads", () => {
    const o = build();
    expect(o.disallowedTools).toEqual(
      expect.arrayContaining(["Read(**/.env)", "Read(**/.env.*)"]),
    );
  });

  it("never lists write / network tools anywhere", () => {
    const o = build();
    const granted = [...(o.tools as string[]), ...(o.allowedTools ?? [])];
    for (const t of ["Edit", "Write", "Bash", "WebFetch", "WebSearch"]) {
      expect(granted).not.toContain(t);
    }
  });

  it("is dontAsk, never bypassPermissions", () => {
    const o = build();
    expect(o.permissionMode).toBe("dontAsk");
    expect(JSON.stringify(o)).not.toMatch(/bypassPermissions/);
    expect(o.allowDangerouslySkipPermissions).toBeFalsy();
  });

  it("isolates settings (no CLAUDE.md, no project hooks)", () => {
    expect(build().settingSources).toEqual([]);
  });

  it("requests structured output with a draft-7 JSON schema", () => {
    const o = build();
    expect(o.outputFormat?.type).toBe("json_schema");
  });

  it("uses a fixed, non-empty system prompt string", () => {
    const o = build();
    expect(typeof o.systemPrompt).toBe("string");
    expect((o.systemPrompt as string).length).toBeGreaterThan(0);
  });

  it("does not override env (inherit process.env)", () => {
    expect(build().env).toBeUndefined();
  });

  it("passes the abortController and cwd through", () => {
    const abortController = new AbortController();
    const o = buildOptions(parseArgs(base), {
      repoRoot: "/repo",
      abortController,
    });
    expect(o.abortController).toBe(abortController);
    expect(o.cwd).toBe("/repo");
  });

  describe("CLI flags only lower limits", () => {
    it("lowers maxTurns and maxBudgetUsd", () => {
      const o = build(["--max-turns", "2", "--max-budget", "0.01"]);
      expect(o.maxTurns).toBe(2);
      expect(o.maxBudgetUsd).toBe(0.01);
    });

    it("clamps higher values to the config", () => {
      const o = build(["--max-turns", "100", "--max-budget", "10"]);
      expect(o.maxTurns).toBe(RELEASE_NOTES_CONFIG.maxTurns);
      expect(o.maxBudgetUsd).toBe(RELEASE_NOTES_CONFIG.maxBudgetUsd);
    });

    it("clamps even if args were built by hand with huge values", () => {
      const args = { ...parseArgs(base), maxTurns: 1000, maxBudget: 1000 };
      const o = buildOptions(args, {
        repoRoot: "/repo",
        abortController: new AbortController(),
      });
      expect(o.maxTurns).toBe(RELEASE_NOTES_CONFIG.maxTurns);
      expect(o.maxBudgetUsd).toBe(RELEASE_NOTES_CONFIG.maxBudgetUsd);
    });
  });
});
