import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { createClaudeAssistant } from "../src/ai/claudeAssistant";
import { ASSISTANT_CONFIG } from "../src/ai/config";
import { RATES, costOf, type Usage } from "./rates";

// PAID: real API calls. Run via `! npm run paid-ask-smoke -w apps/api`.
// Needs the API server running (`npm run dev -w apps/api`): tools read via REST (API_SELF_URL).
const QUESTION = "Which teams exist, and how many open issues does each have?";

const model = ASSISTANT_CONFIG.model;
const rate = RATES[model];
if (!rate) {
  console.error(
    `no rates for "${model}"; known: ${Object.keys(RATES).join(", ")}`,
  );
  process.exit(1);
}
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is not set");
  process.exit(1);
}

// The assistant streams (SSE), so usage is read from the raw events:
// message_start carries input/cache tokens, message_delta the final output tokens.
const rounds: Usage[] = [];
const countingFetch: typeof fetch = async (url, init) => {
  const res = await fetch(url, init);
  try {
    const u: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    for (const line of (await res.clone().text()).split("\n")) {
      if (!line.startsWith("data:")) continue;
      const ev = JSON.parse(line.slice(5)) as {
        type?: string;
        message?: { usage?: Record<string, number> };
        usage?: Record<string, number>;
      };
      if (ev.type === "message_start") {
        const s = ev.message?.usage;
        u.input = s?.input_tokens ?? 0;
        u.cacheRead = s?.cache_read_input_tokens ?? 0;
        u.cacheWrite = s?.cache_creation_input_tokens ?? 0;
      } else if (ev.type === "message_delta") {
        u.output = ev.usage?.output_tokens ?? u.output;
      }
    }
    if (u.input || u.output || u.cacheRead || u.cacheWrite) rounds.push(u);
  } catch {
    // Not an SSE/JSON body: nothing to count.
  }
  return res;
};

const assistant = createClaudeAssistant({
  client: new Anthropic({ apiKey, fetch: countingFetch, maxRetries: 0 }),
  model,
});

console.log("Q:", QUESTION);
try {
  for await (const ev of assistant.chat([{ role: "user", content: QUESTION }], {
    signal: new AbortController().signal,
  })) {
    if (ev.type === "tool") console.log(`[tool] ${ev.name}`);
    else if (ev.type === "text") process.stdout.write(ev.text);
  }
  console.log();
} catch (e) {
  console.log("\nFAILED", e instanceof Error ? e.name : "error");
}

const total: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
rounds.forEach((u, i) => {
  console.log(`round ${i + 1}`, u);
  total.input += u.input;
  total.output += u.output;
  total.cacheRead += u.cacheRead;
  total.cacheWrite += u.cacheWrite;
});
console.log("model:", model);
console.log("total", total);
console.log(`estimated cost: $${costOf(total, rate).toFixed(5)}`);
