# SPEC: DevPulse REST API

Status: draft, from interview. Branch: `feat/rest-api`.

## 1. Goal

REST API in `apps/api` for the web dashboard: teams, members, repositories, issues, pull requests. Built on existing Prisma models and `packages/shared` Zod schemas. Express 5, Prisma 7 (adapter-pg), Zod 4.

## 2. Resources and routes

IDs are opaque strings (uuid text). No uuid check: unknown id -> 404.

| Method | Path | Body | Success | Notes |
|---|---|---|---|---|
| GET | `/health` | - | 200 | existing |
| GET | `/teams` | - | 200 Page<Team> | |
| POST | `/teams` | createTeam | 201 Team | existing route |
| GET | `/teams/:id` | - | 200 Team | |
| PATCH | `/teams/:id` | updateTeam | 200 Team | |
| DELETE | `/teams/:id` | - | 204 | 409 if team has members or repos (FK Restrict) |
| GET | `/teams/:teamId/members` | - | 200 Page<Member> | 404 if team missing |
| POST | `/teams/:teamId/members` | createMember | 201 Member | 404 team missing, 409 login dup |
| GET | `/members/:id` | - | 200 Member | |
| PATCH | `/members/:id` | updateMember | 200 Member | may change `teamId` |
| DELETE | `/members/:id` | - | 204 | |
| GET | `/teams/:teamId/repositories` | - | 200 Page<Repository> | 404 if team missing |
| POST | `/teams/:teamId/repositories` | createRepository | 201 Repository | 404 team missing, 409 name dup |
| GET | `/repositories/:id` | - | 200 Repository | |
| PATCH | `/repositories/:id` | updateRepository | 200 Repository | may change `teamId` (issues/PRs follow via FK) |
| DELETE | `/repositories/:id` | - | 204 | cascades issues + PRs |
| GET | `/repositories/:id/issues` | - | 200 Page<Issue> | 404 if repo missing |
| GET | `/issues/:id` | - | 200 Issue | |
| PATCH | `/issues/:id` | `{ priority }` | 200 Issue | only writable issue field |
| GET | `/repositories/:id/pull-requests` | - | 200 Page<PullRequest> | 404 if repo missing |
| GET | `/pull-requests/:id` | - | 200 PullRequest | read-only |

No POST/DELETE for issues or PRs (GitHub-owned, sync-written; sync is out of scope). `aiSummary`, `labels`, `state`, `number`, `githubCreatedAt`, and all PR fields are never writable via API.

Unknown route -> 404 through the same error handler (code `NOT_FOUND`, message `Route not found`).

## 3. Validation (packages/shared)

Group the schemas in separate files based on prisma model. For example: `packages/shared/src/team.ts`, `packages/shared/src/repository.ts`, etc. `packages/shared/src/index.ts` should export all of these as named exports. (source only, no build). Export Zod schema + inferred type for each.

- `teamSchema`: `{ id, name, createdAt: z.iso.datetime() }`. No longer derived via `createTeamSchema.extend(...)`.
- `createTeamSchema`: unchanged (`name` trim, min 1). Add `.max(100)` to all `name` fields.
- `updateTeamSchema`: `{ name }` optional.
- `memberSchema` `{ id, teamId, name, githubLogin }`; `createMemberSchema` `{ name, githubLogin }`; `updateMemberSchema` `{ name?, githubLogin?, teamId? }`.
- `repositorySchema` `{ id, teamId, githubFullName }`; `createRepositorySchema` `{ githubFullName }`; `updateRepositorySchema` `{ githubFullName?, teamId? }`.
- `updateIssueSchema`: `{ priority }` (required, `prioritySchema`).
- Format:
  - `githubLogin`: `/^(?!-)(?!.*--)(?!.*-$)[A-Za-z0-9-]{1,39}$/`
  - `githubFullName`: `/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/`
- All `update*Schema`: `.strict()` (unknown key -> 400) plus `.refine` at least one key present (empty `{}` -> 400). Same ZodIssue[] shape.
- Query schemas (parsed with `safeParse`; Express 5 `req.query` is a getter, never mutate):
  - `paginationQuerySchema`: `limit` (coerce int, 1..100, default 20), `offset` (coerce int, >=0, default 0). Out of range -> 400, not clamped.
  - `issueListQuerySchema`: pagination + `state` (csv of `issueStateSchema`), `priority` (csv of `prioritySchema`), `label` (single string), `sort` (`githubCreatedAt|number|priority`, default `githubCreatedAt`), `order` (`asc|desc`, default `desc`).
  - `pullRequestListQuerySchema`: pagination + `state` (csv of `prStateSchema`), `sort` (`number|reviewRequestedAt|mergedAt`, default `number`), `order` (default `desc`).
  - Teams/members/repos lists: pagination only. Fixed order: teams `createdAt asc`, members `name asc`, repos `githubFullName asc`.
  - Every `orderBy` appends `{ id: "asc" }` as tiebreaker (stable offset paging).
- `paginated(itemSchema)`: helper returning `z.object({ items: z.array(itemSchema), total: z.number().int(), limit, offset })`. Generic: `<T extends z.ZodType>(item: T)` so each `paginated(teamSchema)` keeps its item type (explain in code comment, per CLAUDE.local.md).
- `apiErrorSchema` (dev envelope): `{ error: { code, message, stack? } }`, `code` enum below. Exported so web can parse errors.
- `GET /teams` changes from bare array to `Page<Team>`. No web consumer exists yet; confirm with `grep` before merging.

## 4. Row -> response

Extend `apps/api/src/dto.ts` with `toTeamDto`, `toMemberDto`, `toRepositoryDto` (same pattern as `toIssueDto`: build object, run through shared schema `.parse`). Replace inline `teamSchema.parse({...})` in routes. Dates always ISO strings.

Output `.parse` ZodErrors are server bugs -> 500, never 400 (see 5.1 `parseInput`).

## 5. Errors and logging

### 5.1 Error contract

Decided by `process.env.NODE_ENV === "production"` at request time (unset/development/test -> dev shape).

| Case | Status | `code` | Prod body | Dev body |
|---|---|---|---|---|
| Zod input validation | 400 | `VALIDATION` | `{ error: ZodIssue[] }` | **same** `{ error: ZodIssue[] }` |
| Malformed JSON / body-parser 4xx | 400 | `BAD_REQUEST` | `{ error: "<message>" }` | `{ error: { code, message, stack } }` |
| Not found (row, parent, route) / Prisma P2025 | 404 | `NOT_FOUND` | string | envelope |
| Conflict (dup, team not empty) / P2002 / P2003 | 409 | `CONFLICT` | string | envelope |
| Anything else | 500 | `INTERNAL` | `{ error: "Internal server error" }` | envelope, message `"Internal server error"`, `stack` = real stack |

Rules:
- Prod string must equal dev `error.message` for the same failure. 500 message is the fixed generic string in both; real details only in dev `stack` and in logs.
- Prisma mapping (P2002->409, P2025->404, P2003->409 generic "Conflicting reference") applies in both envs.
- Validation keeps the existing CLAUDE.md shape; web must handle `error` as array | string | object.
- Handlers throw; Express 5 forwards rejected async handlers, no wrapper needed.

### 5.2 Error types (`apps/api/src/errors.ts`)

```ts
class AppError extends Error { status: number; code: ErrorCode }
class NotFoundError extends AppError      // 404
class ConflictError extends AppError      // 409
class ValidationError extends AppError    // 400, carries ZodIssue[]
function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S>
// safeParse; on failure throw ValidationError(issues). Used for body, query only.
function mapPrismaError(e: unknown): AppError | undefined
```

- Unique-violation messages are fixed per constraint/field: `"githubLogin already exists"`, `"githubFullName already exists"`. Verify what `meta` the adapter-pg error exposes (may be `meta.driverAdapterError.cause.constraint`/fields, not `meta.target`) and map by that; unknown constraint -> `"Resource already exists"`.
- `ZodError` that reaches the error handler directly is NOT validation -> 500.

### 5.3 Case-insensitive uniqueness (DB level, citext)

Member `githubLogin` and repo `githubFullName` are `@db.Citext` (migration `citext_github_names`, which runs `CREATE EXTENSION IF NOT EXISTS citext;`). The existing `@unique` index is therefore case-insensitive, and any duplicate (any casing) on POST/PATCH raises P2002, mapped to `"<field> already exists"` (409). No app-level pre-check, so no race gap. Stored casing kept as given. `_`/`%` are literal (no ILIKE wildcard issue).

### 5.4 Team delete and moves

- `Member.team` and `Repository.team` FKs change to `onDelete: Restrict` (new Prisma migration `team_fk_restrict`). `Repository -> Issue/PullRequest` stays `Cascade`.
- `DELETE /teams/:id`: `deleteMany`-free; call `prisma.team.delete`, catch P2003 -> `ConflictError("Team has members or repositories")`; P2025 -> 404.
- Moves (`teamId` in PATCH member/repo): pre-check target team exists -> else `NotFoundError("Team not found")`. A race producing P2003 falls to the generic 409 mapping.
- POST under a missing parent team: 404 via the same pre-check. Existence checks for list routes use `findUnique` (select id).

### 5.5 Logging (pino)

- Deps: `pino`, `pino-http`. `apps/api/src/logger.ts` exports one shared `logger`. JSON lines in both envs (no pino-pretty; pretty-printing would change structure).
- Request log (pino-http, `genReqId` = `crypto.randomUUID()`, echoed as `X-Request-Id` response header): `{ level, time, reqId, req: { method, url }, res: { statusCode }, responseTime, msg }`.
- Error log from the error handler, identical structure in both envs: `{ level, time, reqId, req: { method, url }, status, code, err: { type, message, code?, stack? }, msg }`.
  - 5xx: `error` level, `err.stack` included.
  - 4xx: `warn` level, no `stack`.
- Level from `LOG_LEVEL` (default `info`). No request bodies in logs.

## 6. Other cross-cutting

- CORS: `cors` middleware, origin from `WEB_ORIGIN` (default `http://localhost:3000`). Add to `apps/api/.env.example`.
- `express.json()` stays; default 100kb limit is fine.
- `req.params` are plain strings; no param schema.

## 7. Files

New (`apps/api/src`):
- `app.ts`: `createApp()` wires cors, pino-http, json, routers, notFound, errorHandler (no listen).
- `logger.ts`
- `errors.ts` (5.2)
- `middleware/errorHandler.ts`, `middleware/notFound.ts`
- `lib/pagination.ts`: `page(items, total, query)` and `offset/limit` -> Prisma `skip/take`; `lib/csv.ts` for csv-enum parsing helper (or put csv helper in shared schemas)
- `routes/teams.ts`, `routes/members.ts`, `routes/repositories.ts`, `routes/issues.ts`, `routes/pullRequests.ts`
- `apps/api/prisma/migrations/<ts>_team_fk_restrict/migration.sql` (generated by `npm run db:migrate -w apps/api -- --name team_fk_restrict`)
- `apps/api/scripts/smoke.sh` (section 9)

Modified:
- `apps/api/src/index.ts`: only `createApp().listen(port)`; keep `console.log` -> `logger.info`.
- `apps/api/src/dto.ts`: add team/member/repository converters.
- `apps/api/prisma/schema.prisma`: `onDelete: Restrict` on `Member.team`, `Repository.team`.
- `apps/api/prisma/seed.ts`: replace `team.deleteMany()` with ordered deletes: `pullRequest`, `issue`, `repository`, `member`, `team` (each `deleteMany`).
- `apps/api/package.json`: add `pino`, `pino-http`, `cors`, `@types/cors`; add `"smoke": "bash scripts/smoke.sh"`.
- `apps/api/.env.example`: `WEB_ORIGIN`, `LOG_LEVEL`.
- `packages/shared/src/index.ts`: section 3.
- `CLAUDE.md` (repo root):
  - Architecture: replace "Keep this shape for all endpoints" with the error contract from 5.1 (validation stays array; others string in prod / envelope in dev).
  - Commands: `db:seed` no longer relies on cascade (ordered deletes); mention `smoke`.
  - Gotcha: input parsing must go through `parseInput`; raw `ZodError` = 500; case-insensitive uniqueness is DB-level (citext).
  - Add env vars `WEB_ORIGIN`, `LOG_LEVEL`.

Unchanged: `apps/web` (never imports api), `src/db.ts`, generated Prisma client (regenerate via `npm run db:generate -w apps/api`; `src/generated` is output).

## 8. Out of scope

- Auth, rate limiting, multi-tenancy.
- Creating/deleting issues or PRs; editing GitHub-owned fields; `aiSummary` writes; GitHub sync job.
- Cursor pagination, counts/aggregates (`_count`), team-wide issue/PR endpoints (`/teams/:id/issues`).
- Lowercase normalization of stored values.
- Test framework (Vitest/supertest); smoke script is the only automated check.
- Automated coverage of the 500 path (needs fault injection); verify manually if desired.
- OpenAPI docs, request-size tuning, soft deletes, web dashboard work, Next.js proxy.

## 9. Verification (Claude runs this end to end)

Prereqs: Docker running, `.env` copied from `.env.example`.

1. `docker compose up -d`
2. `npm run db:generate -w apps/api` then `npm run db:reset -w apps/api` (applies migrations incl. `team_fk_restrict`, runs new seed; must succeed twice in a row, proving ordered deletes work).
3. `npm run typecheck` (root).
4. Dev mode: `PORT=4100 npm run dev -w apps/api` in background; wait for `/health`; run `BASE_URL=http://localhost:4100 MODE=dev npm run smoke -w apps/api`; stop server.
5. Prod mode: `NODE_ENV=production PORT=4100 npx tsx apps/api/src/index.ts` in background; run `BASE_URL=http://localhost:4100 MODE=prod npm run smoke -w apps/api`; stop server.
6. `git status` shows only files listed in section 7. Report each step's output; any non-zero exit or assertion failure = not done.

`apps/api/scripts/smoke.sh` (bash, curl only, no jq; asserts HTTP status plus `grep -q` on compact JSON; exits non-zero on first failure; prints PASS/FAIL per check). Checks:
- `GET /health` 200.
- `GET /teams` 200; body has `"items"`, `"total"`, `"limit":20`, `"offset":0`; `?limit=1` returns 1 item; `?limit=0` and `?limit=101` -> 400 array body.
- `POST /teams` valid 201 (captures id); `{"name":"  "}` 400 array body with `"path":["name"]`; malformed JSON 400 (`BAD_REQUEST` in dev, plain string in prod).
- Team CRUD: `GET /teams/<id>` 200 incl. `createdAt`; `PATCH` rename 200; `PATCH {}` 400; `PATCH {"nmae":"x"}` 400; `GET /teams/nope` 404; `DELETE` empty team 204; second DELETE 404.
- Members: POST under new team 201; POST `githubLogin` `Ada` (seed has `ada`) 409 `githubLogin already exists`; bad login `-x` 400; `PATCH` move to another team 200; move to missing team 404; list under missing team 404.
- Repos: POST `devpulse/API` (seed has `devpulse/api`) 409; `bad` (no slash) 400; move 200; DELETE repo with issues 204, then its issues 404 (cascade).
- Team with members or repos: `DELETE` 409 `Team has members or repositories`; after deleting children -> 204.
- Issues: list seed repo `?state=OPEN` all OPEN; `?priority=HIGH,URGENT`; `?label=bug`; `?sort=priority&order=asc`; paging: `limit=2` pages 0 and 1 share no ids; `?state=BOGUS` 400. `PATCH /issues/<id> {"priority":"LOW"}` 200 reflects; `{"title":"x"}` 400; `{"priority":"NOPE"}` 400.
- PRs: list 200; `?state=MERGED` only MERGED with non-null `mergedAt`; `PATCH /pull-requests/<id>` 404 (route not defined).
- Error shape by `MODE`: for a 404, `MODE=dev` expects `"code":"NOT_FOUND"` and `"stack"`; `MODE=prod` expects body exactly `{"error":"Team not found"}` (no `code`, no `stack`). 409 likewise. Validation body is an array in both modes.
- `X-Request-Id` header present on responses.
- Log shape: the script cannot read server logs; step 4/5 additionally `grep` the captured server stdout (redirected to a file by Claude) for one `"level":40` line containing `reqId`, `"status":404`, and `"err":{` in BOTH modes, and assert no `"stack"` on that 4xx line.
