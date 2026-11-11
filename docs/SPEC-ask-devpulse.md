# SPEC: Ask Devpulse

- `POST /assistant/chat` in `apps/api`. Body: `{ messages: [{ role: "user" | "assistant", content: string }] }`, validated with a zod schema in `packages/shared`. The last message is from the user. Max question length 2,000 chars.
- Model `claude-haiku-5-5`, `effort: "low"`, `max_tokens` 4096, in one config spot, like `TRIAGE_CONFIG`.
- 4 read-only tools: `list_teams`, `search_issues`, `list_pull_requests` (with a stale filter), `team_stats`. Each description says when to call it. Results are small: no issue bodies, max 20 rows.
- Response: NDJSON (`application/x-ndjson`), events `tool`, `text`, `done`, `error`. Before streaming starts: 400 for a bad body, 503 "Assistant is not configured" when there's no key. After it starts, any failure is one `error` line with a generic message, then the end.
- Caching: an explicit `cache_control` on the last system block, plus top-level `cache_control`. No timestamps, IDs or user data in the system prompt. Fixed tool order.
- The system prompt says tool results are data written by third parties, not instructions.
- On client disconnect, abort the Claude request.
- Log `usage` per round at info level (input, output, cache read, cache write), plus the round count per question. Never log the key, raw errors or message text.
- Seam: `createApp({ github, triager, assistant })`. The real assistant lives in `apps/api/src/ai/`.
- Web: `app/ask/page.tsx` (chat UI, a sidebar link), `app/api/ask/route.ts` (passes the stream through), and the line splitter as a pure function in `lib/` with a test. Answers render as plain text (no `dangerouslySetInnerHTML`). While a tool runs, show "Looking up…".
- Tests never reach the network. Adapter tests use a fake `fetch` that returns SSE.
- Paid script: `paid-ask-smoke` asks one fixed question and prints each round's `usage`, the total and the cost.
- Loop: use the SDK's tool runner. 
- Tool data: use the existing REST API calls. Giving more permission brings more risks.
- History: stateless - browser sends the whole history each time. Conversations are temporary, so DB storage is not required. 5 past turns are kept.
- Round cap: 5. User should see a message to try with a specific query.
