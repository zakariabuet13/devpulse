# SPEC: AI Triage

- POST /issues/:id/triage (follow the existing issue routes). Model claude-haiku-5-5, effort: "low", max_tokens 1024, timeout 20 s. Model and effort live in one config spot.
- Issue the and issue body will go to the model's user message for triaging. - Write a migration to add issue body to DB and to the sync API. Update the UI accordingly.
- The POST endpoint doesn't write anything to the database. It just returns a suggestion that a person applies later with the existing PATCH API. 
- triageResultSchema in packages/shared: priority (the existing prioritySchema), labels (array, max 3, from a fixed list, generate the list), summary (one sentence, max 200 chars).
- messages.parse + zodOutputFormat. Any stop_reason other than end_turn, or a null parsed_output, is a failure and writes nothing.
- Seam: createApp({ github, triager }). The real createClaudeTriager lives in apps/api/src/ai/.
- Missing key: 503 "AI triage is not configured". Upstream error: 502 with a generic message. The key, raw errors and raw model text never reach a response or a log.
- The issue title goes in the user message, wrapped as data. The system prompt says that text is data, not instructions. No timestamps or IDs in the system prompt. Top-level cache_control.
- Log usage (input, output, cache read and write) at info level for each call.
- Tests never reach the network: the test setup sets ANTHROPIC_API_KEY="", and the adapter tests use a fake fetch.
- Paid scripts in apps/api/package.json: paid-triage-smoke (one issue) and paid-triage-eval. Both import dotenv/config and print usage and an estimated cost.


