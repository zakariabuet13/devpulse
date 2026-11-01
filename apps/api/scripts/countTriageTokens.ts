import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { buildUserContent, SYSTEM_PROMPT } from "../src/ai/claudeTriager";
import { TRIAGE_CONFIG } from "../src/ai/config";

// Token counting is free (no generation), but it does call the API, so it needs the key.
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is not set");
  process.exit(1);
}

const client = new Anthropic({ apiKey, maxRetries: 0 });
const { input_tokens } = await client.messages.countTokens({
  model: TRIAGE_CONFIG.model,
  system: SYSTEM_PROMPT,
  messages: [
    {
      role: "user",
      content: buildUserContent(
        "Login fails for SSO users after deploy",
        "500 on /login for all SAML accounts since 14:00.",
      ),
    },
  ],
});
console.log(`input tokens (system prompt + 1 issue): ${input_tokens}`);
