import "dotenv/config"; // loads apps/agents/.env: the SDK won't
import { appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const isolated = process.argv.includes("--isolated");
mkdirSync("runs", { recursive: true });
const log = `runs/hello-${Date.now()}.jsonl`;

try {
  for await (const m of query({
    prompt:
      "Which workspace in this repo has the most test files? Answer in two sentences. Don't change anything.",
    options: {
      cwd: repoRoot,
      model: "claude-haiku-5-5",
      effort: "low",
      tools: ["Read", "Grep", "Glob"], // the built-in tools Claude can see
      allowedTools: ["Read", "Grep", "Glob"], // the calls approved without asking
      permissionMode: "dontAsk", // anything else that would ask: denied
      maxTurns: 8,
      maxBudgetUsd: 0.05,
      ...(isolated ? { settingSources: [] } : {}),
    },
  })) {
    appendFileSync(log, JSON.stringify(m) + "\n"); // every message, raw, for later
    if (m.type === "system" && m.subtype === "init") {
      console.log({
        apiKeySource: m.apiKeySource,
        version: m.claude_code_version,
        model: m.model,
        permissionMode: m.permissionMode,
        tools: m.tools.length,
        skills: m.skills,
        mcp: m.mcp_servers,
      });
    }
    if (m.type === "assistant") {
      for (const b of m.message.content) {
        console.log(
          `[${m.message.id.slice(-6)}] ${b.type}${b.type === "tool_use" ? " " + b.name : ""}`,
        );
      }
    }
    if (m.type === "result") {
      console.log(
        m.subtype,
        "turns:",
        m.num_turns,
        "cost: $" + m.total_cost_usd.toFixed(5),
      );
      if (m.subtype === "success") console.log(m.result);
      console.log(m.modelUsage);
    }
  }
} catch (err) {
  console.error("query ended with an error:", err); // query() throws after an error result
  process.exitCode = 1;
}
