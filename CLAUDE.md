## Commands

Run from repo root:

- `npm run dev` — web (:3000) + api (:4000) in parallel.
- Single workspace: `npm run dev -w apps/api`, `npm run typecheck -w apps/web`, etc.

## Architecture

- `apps/api`: Request bodies are validated with zod schemas from `packages/shared`.
  - Validation errors: `400 { error: ZodIssue[] }` (see POST /teams). Keep this shape for all endpoints.
- `apps/web`: Never imports from `apps/api`; shared code goes in packages/shared.
- `packages/shared`: Ships **TypeScript source, no build step** (`main`/`exports` → `src/index.ts`). Consumers must transpile it:
  - web: `transpilePackages: ["@devpulse/shared"]` in `next.config.ts`
  - api: `tsx` in dev; `tsup --noExternal @devpulse/shared` bundles it for `build`


## Gotchas

- Web `typecheck` is `next typegen && tsc --noEmit`: Next 16 generates global types (e.g. `LayoutProps`) that plain `tsc` can't see.
- api `lint` is just `tsc --noEmit` (no ESLint there); only web has ESLint.

## Workflow

- After a series of edits, run `npm run typecheck`, not the full build.
