import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { triageResultSchema } from "@devpulse/shared";
import { buildUserContent, SYSTEM_PROMPT } from "../src/ai/claudeTriager";
import { TRIAGE_CONFIG } from "../src/ai/config";

// Token counting is free (no generation), but it does call the API, so it needs the key.
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is not set");
  process.exit(1);
}

const client = new Anthropic({ apiKey, maxRetries: 0 });
const base = {
  model: TRIAGE_CONFIG.model,
  system: SYSTEM_PROMPT,
  messages: [
    {
      role: "user" as const,
      content: buildUserContent(
        "Login fails for SSO users after deploy",
        "500 on /login for all SAML accounts since 14:00.",
      ),
    },
  ],
};

const plain = await client.messages.countTokens(base);
const withFormat = await client.messages.countTokens({
  ...base,
  output_config: {
    effort: TRIAGE_CONFIG.effort,
    format: zodOutputFormat(triageResultSchema),
  },
});

console.log(`input tokens (system prompt + 1 issue): ${plain.input_tokens}`);
console.log(
  `input tokens (+ output_config format): ${withFormat.input_tokens}`,
);
console.log(`schema overhead: ${withFormat.input_tokens - plain.input_tokens}`);
