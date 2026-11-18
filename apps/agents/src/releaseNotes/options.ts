import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { Args } from "./args";
import { RELEASE_NOTES_CONFIG } from "./config";
import { createNotesServer, type RunGh } from "./prTool";
import { SYSTEM_PROMPT } from "./prompt";
import { releaseNotesJsonSchema } from "./schema";

export type Deps = {
  repoRoot: string;
  abortController: AbortController;
  runGh?: RunGh;
};

export function buildOptions(args: Args, deps: Deps): Options {
  return {
    cwd: deps.repoRoot,
    model: RELEASE_NOTES_CONFIG.model,
    effort: RELEASE_NOTES_CONFIG.effort,
    tools: [], // no built-ins: MCP tool only
    allowedTools: ["mcp__notes__get_pull_request"],
    disallowedTools: ["Read(**/.env)", "Read(**/.env.*)"], // defense in depth
    permissionMode: "dontAsk",
    settingSources: [], // isolation: no CLAUDE.md, no project hooks
    mcpServers: { notes: createNotesServer(deps.runGh) },
    outputFormat: { type: "json_schema", schema: releaseNotesJsonSchema },
    // flags can only lower the limits
    maxTurns: Math.min(args.maxTurns, RELEASE_NOTES_CONFIG.maxTurns),
    maxBudgetUsd: Math.min(args.maxBudget, RELEASE_NOTES_CONFIG.maxBudgetUsd),
    abortController: deps.abortController,
    systemPrompt: SYSTEM_PROMPT,
  };
}
