## Commands

Run from repo root:

- `npm run dev` — web (:3000) + api (:4000) in parallel.
- Single workspace: `npm run dev -w apps/api`, `npm run typecheck -w apps/web`, etc.
- `npm run db:seed -w apps/api` - deletes PRs, issues, repos, members, teams in that order (team FKs are Restrict, no cascade), then re-creates the sample data
- `npm run db:reset -w apps/api` - wipes the DB, re-runs migrations and seed
- `npm test -w apps/api` - Vitest + supertest on `createApp()` against real Postgres `devpulse_test` (globalSetup creates + `migrate deploy`s it; needs `docker compose up -d`); all tables truncated before each test; files run serially. Factories in `apps/api/test/factories.ts`.
- `docker compose up -d` - starts the Postgres DB in docker
- api env (`apps/api/.env.example`): `DATABASE_URL`, `WEB_ORIGIN` (CORS origin, default `http://localhost:3000`), `LOG_LEVEL` (pino, default `info`)

## Architecture

- `apps/api`: Request bodies are validated with zod schemas from `packages/shared`.
  - Error contract (`src/middleware/errorHandler.ts`, `src/errors.ts`): handlers throw, Express 5 forwards async rejections.
    - Validation: `400 { error: ZodIssue[] }` in every env.
    - Everything else: prod `{ error: "<message>" }`; dev `{ error: { code, message, stack } }` (`NODE_ENV`). Codes: `BAD_REQUEST`, `NOT_FOUND`, `CONFLICT`, `INTERNAL` (500 message is always "Internal server error").
    - Web must handle `error` as array | string | object (`apiErrorSchema` in shared).
  - Lists return `Page<T>` (`{ items, total, limit, offset }`), pagination via `limit`/`offset` query.
- `apps/web`: Never imports from `apps/api`; shared code goes in packages/shared.
- `packages/shared`: Ships **TypeScript source, no build step** (`main`/`exports` → `src/index.ts`). Consumers must transpile it:
  - web: `transpilePackages: ["@devpulse/shared"]` in `next.config.ts`
  - api: `tsx` in dev; `tsup --noExternal @devpulse/shared` bundles it for `build`


## Gotchas

- Web `typecheck` is `next typegen && tsc --noEmit`: Next 16 generates global types (e.g. `LayoutProps`) that plain `tsc` can't see.
- api `lint` is just `tsc --noEmit` (no ESLint there); only web has ESLint.
- Postgres runs on 5435, not the default 5432
- api input (body, query) must go through `parseInput`; a raw `ZodError` reaching the error handler is a server bug -> 500. Never mutate `req.query` (Express 5 getter).
- Case-insensitive uniqueness of `githubLogin` / `githubFullName` is enforced by the DB: both columns are `@db.Citext` (migration `citext_github_names` creates the extension), so the `@unique` index is case-insensitive and violations surface as P2002 -> 409. No app-level pre-check; stored casing is kept as given.
- Prisma unique violations under adapter-pg expose the constraint at `meta.driverAdapterError.cause.constraint.index` (no `meta.target`).

## Workflow

- After a series of edits, run `npm run typecheck`, not the full build.

## Compact Instructions

- keep final Prisma models, shared zod schema names

## Git

- branches `feat/<slug>` or `fix/<slug>`
- open PRs against `main`
- squash-merge