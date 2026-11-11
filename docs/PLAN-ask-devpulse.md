# Plan: Ask DevPulse (docs/SPEC-ask-devpulse.md)

## Context

Add a chat assistant: `POST /assistant/chat` (apps/api) streams NDJSON from Claude Haiku 5.5 using 4 read-only tools backed by the existing REST API. Web gets `/ask` page + proxy route. Branch `feat/ask-devpulse` already exists (has unrelated staged triage tweaks, keep them out of this commit or commit separately).

Decisions (confirmed with user):

- Tools call the API via **loopback HTTP** (new env `API_SELF_URL`, default `http://localhost:${PORT}`).
- History trimmed **both sides**: web sends last 5 turns (10 msgs + new user msg); shared schema caps messages at 11.
- Stale-PR rule **moved to packages/shared**, used by web and the tool.

Findings that shape the plan:

- Seam pattern to copy: `createApp({github, triager})` in `apps/api/src/app.ts` with lazy getter + `createTriagerFromEnv()` returning `undefined` w/o key; `routes/triage.ts` throws `ServiceUnavailableError`.
- `TRIAGE_CONFIG` in `apps/api/src/ai/config.ts` -> add `ASSISTANT_CONFIG`.
- SDK `@anthropic-ai/sdk` 1.3.0: `client.beta.messages.toolRunner(params, {signal})` + `betaZodTool` (`@anthropic-ai/sdk/helpers/beta/zod`), zod 4. Triager uses non-beta `messages.parse`; assistant uses beta namespace (Beta types).
- API has no stale filter; staleness only in `apps/web/lib/stalePrs.ts` (OPEN, reviewRequestedAt set, >3 days).
- `errorHandler` can't help after headers sent -> route must handle post-stream errors itself.
- Web: Next 16.3.8 has breaking changes; web CLAUDE.md/AGENTS.md says read `node_modules/next/dist/docs/` before writing code. No `app/api/*` exists yet. `lib/api.ts` keeps `API_URL` private.
- Haiku 5.5: adaptive thinking on by default, `effort: "low"` OK, no forced `tool_choice`, no prefill. No refusal fallback available for Haiku; handle `stop_reason: "refusal"` as an `error` event.

## Steps (order: shared -> tests -> api -> web -> script -> review)

### 1. packages/shared

- New `src/assistant.ts`:
  - `chatMessageSchema` `{role: "user"|"assistant", content: string}` (assistant content max 8000, user max 2000).
  - `chatRequestSchema`: `messages` min 1, max 11, last role must be `user` (refine), last content <= 2000.
  - `assistantEventSchema` discriminated union on `type`: `tool {name}`, `text {text}`, `done {}`, `error {message}`. Types `ChatMessage`, `ChatRequest`, `AssistantEvent`.
  - Export `MAX_QUESTION_CHARS=2000`, `MAX_HISTORY_TURNS=5`.
- New `src/stalePrs.ts`: move `STALE_THRESHOLD_MS` + stale predicate from `apps/web/lib/stalePrs.ts` (read it first; keep its existing test passing, web file re-exports or imports from shared).
- Re-export both from `src/index.ts` (explicit named exports + `export type`).

### 2. Tests first (use `agent-test-writer` subagent, then confirm they fail)

`apps/api/test/`:

- `assistant.test.ts` (route, fake assistant via `createApp({assistant})`): `it.each` 400 cases (not array, empty, last msg assistant, >2000 chars boundary 2000/2001, >11 msgs), 503 "Assistant is not configured" (`vi.stubEnv("ANTHROPIC_API_KEY","")`), NDJSON content-type + event order, error after stream start = one generic `error` line then end (secret in thrown error absent), client disconnect aborts signal.
- `claudeAssistant.test.ts` (fake `fetch` returning SSE): request body has `cache_control` on last system block AND top-level; system prompt has no ids/timestamps and says tool results are third-party data; tool order fixed (list_teams, search_issues, list_pull_requests, team_stats); tool round-trip emits `tool` then `text` then `done`; round cap 5 -> text asking for a specific query; usage logged per round + round count; no message text/key in logs; abort signal propagates.
- `assistantTools.test.ts` (fake REST fetch): <=20 rows, no `body`/`aiSummary`, stale filter boundary (exactly 3 days vs just over), tool failure -> generic result.

### 3. apps/api

- `src/ai/config.ts`: `ASSISTANT_CONFIG = { model: "claude-haiku-5-5", effort: "low", maxTokens: 4096, maxRounds: 5, timeoutMs }` as const.
- `src/ai/assistant.ts`: `interface Assistant { chat(messages: ChatMessage[], opts: {signal: AbortSignal}): AsyncIterable<AssistantEvent> }` + generic `AssistantError`.
- `src/ai/restClient.ts`: tiny typed loopback client (fetch + signal, base from `API_SELF_URL`); errors carry no body.
- `src/ai/assistantTools.ts`: four `betaZodTool`s in fixed order, each description says when to call it. `search_issues` -> `GET /teams/:id/issues` (q, state, priority, limit<=20, strip body/aiSummary); `list_pull_requests` -> `GET /teams/:id/pull-requests` (state OPEN, sort reviewRequestedAt asc, `stale` flag filters via shared rule, cap 20); `team_stats` -> `GET /teams/:id/stats`; `list_teams` -> `GET /teams`. Reuse field-trimming idea from `apps/mcp/src/server.ts`.
- `src/ai/claudeAssistant.ts`: `createClaudeAssistant({client})` using `client.beta.messages.toolRunner({..., stream: true, max_iterations: 5, cache_control: {type:"ephemeral"}, system:[{type:"text", text: SYSTEM_PROMPT, cache_control}], tools}, {signal})`. Per round: yield `tool` on tool_use start, `text` on text deltas, log `usage` (input/output/cache read/cache write) at info; log round count at end. If cap reached with tool_use pending, yield apologetic `text` ("try a more specific query") then `done`. Verify exact `max_iterations`/stream semantics against SDK docs (`typescript/claude-api/tool-use.md` in claude-api skill) before coding. Map all SDK errors to generic `AssistantError` (drop original).
- `createAssistantFromEnv()`: `undefined` if no `ANTHROPIC_API_KEY`, else `new Anthropic({apiKey, maxRetries: 0})`.
- `src/routes/assistant.ts`: `createAssistantRouter(getAssistant)`. `parseInput(chatRequestSchema, req.body)` (400) -> 503 if no assistant -> set `application/x-ndjson`, `flushHeaders`, `AbortController` aborted on `res.on("close")` when not finished -> write `JSON.stringify(event)+"\n"` per event -> on throw log class name only, write one generic `error` line, `end()`.
- `src/app.ts`: `createApp({ github, triager, assistant })`, lazy getter like triager; mount router.
- `.env.example`: add `API_SELF_URL` (user must copy into `.env`; Claude can't read it).
- `scripts/paidAsk.ts` + `package.json` `"paid-ask-smoke": "tsx scripts/paidAsk.ts"`: one fixed question, prints per-round usage, total, cost. Reuse `RATES` from `scripts/paidTriage.ts` (extract to a shared scripts module if needed). **User must run with `!`** (spends credit).

### 4. apps/web (read `node_modules/next/dist/docs/` route-handler + streaming docs first)

- `lib/ndjson.ts`: pure `splitLines(carry: string, chunk: string) -> { lines: string[]; rest: string }` + `parseEvent(line)` using `assistantEventSchema.safeParse`. `lib/ndjson.test.ts`: multiple lines per chunk, line split across chunks, empty lines ignored, trailing partial kept in `rest`, bad JSON ignored.
- Export `API_URL` from `lib/api.ts` (or read env in the route).
- `app/api/ask/route.ts`: `POST`; validate with `chatRequestSchema` (400); `fetch(`${API_URL}/assistant/chat`, {method:"POST", body, signal: req.signal})`; return `new Response(upstream.body, {status, headers:{"Content-Type":"application/x-ndjson"}})`; unreachable -> 502 JSON.
- `app/ask/page.tsx` (server shell, same heading/card styles as other pages) + `components/AskChat.tsx` (`"use client"`): messages state, trim to last 5 turns before send, `maxLength=2000`, reader loop with `TextDecoder` + `splitLines`; `tool` -> "Looking up…" indicator, `text` -> append, `done` -> idle, `error` -> inline message. Render with `whitespace-pre-wrap` text only, never `dangerouslySetInnerHTML`. Abort on unmount.
- `components/Sidebar.tsx`: `<NavLink href="/ask" icon={<CommentIcon />} label="Ask" />` after Members.

### 5. Wrap-up

- Run `agent-security-reviewer` on the branch before PR (CLAUDE.md rule); then PR against `main` (squash-merge).

## Verification

- `npm test -w packages/shared`-adjacent: `npm run typecheck -w apps/web`, `npm run typecheck -w apps/api`.
- `docker compose up -d`, `npm test -w apps/api` (new tests green, no network), `npm test -w apps/web` (ndjson + stalePrs).
- `npm run dev`; `curl -N -X POST localhost:4000/assistant/chat -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"list teams"}]}'` -> NDJSON lines; bad body -> 400; no key -> 503.
- Browser at :3000/ask: ask a question, see "Looking up…", streamed text, sidebar link active; close tab mid-stream -> API logs abort.
- User runs `! npm run paid-ask-smoke -w apps/api`: check per-round usage, cache read > 0 on later rounds, cost printout.
