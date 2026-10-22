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
  - Lists return `Page<T>` (`{ items, total, limit, offset }`), pagination via `limit`/`offset` query.
- `apps/web`: Never imports from `apps/api`; shared code goes in packages/shared.
- `packages/shared`: Ships **TypeScript source, no build step** (`main`/`exports` → `src/index.ts`). Consumers must transpile it:
  - web: `transpilePackages: ["@devpulse/shared"]` in `next.config.ts`
  - api: `tsx` in dev; `tsup --noExternal @devpulse/shared` bundles it for `build`


## Gotchas

- Postgres runs on 5435, not the default 5432
- Case-insensitive uniqueness of `githubLogin` / `githubFullName` is enforced by the DB: both columns are `@db.Citext` (migration `citext_github_names` creates the extension), so the `@unique` index is case-insensitive and violations surface as P2002 -> 409. No app-level pre-check; stored casing is kept as given.
- Claude can't read `.env` (team settings deny it): add new env vars to `apps/api/.env.example` and ask the user to copy them into `.env`.


## Compact Instructions

- keep final Prisma models, shared zod schema names

## Git

- branches `feat/<slug>`, `fix/<slug>`, or `chore/<slug>`
- open PRs against `main`
- squash-merge
