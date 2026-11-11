import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "../src/ai/claudeAssistant";
import { createAssistantTools } from "../src/ai/assistantTools";
import { ASSISTANT_CONFIG } from "../src/ai/config";

// Token counting is free (no generation), but it does call the API, so it needs the key.
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is not set");
  process.exit(1);
}

const client = new Anthropic({ apiKey, maxRetries: 0 });
const model = ASSISTANT_CONFIG.model;
const question = {
  role: "user" as const,
  content: "Which pull requests are waiting on review for more than 3 days?",
};

// Send plain definitions: the runnable tools also carry `run`/`parse` functions.
const tools = createAssistantTools().map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.input_schema,
}));

const count = async (p: {
  system?: string;
  tools?: typeof tools;
  messages?: (typeof question)[];
}) =>
  (
    await client.beta.messages.countTokens({
      model,
      messages: [question],
      ...p,
    })
  ).input_tokens;

const questionOnly = await count({});
const withSystem = await count({ system: SYSTEM_PROMPT });
const withTools = await count({ tools });
const all = await count({ system: SYSTEM_PROMPT, tools });

console.log(`question only:            ${questionOnly}`);
console.log(`system prompt:            ${withSystem - questionOnly}`);
console.log(
  `tools (${tools.length}):                ${withTools - questionOnly}`,
);
console.log(`total (system+tools+q):   ${all}`);
