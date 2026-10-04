## Commands

Run from repo root (npm workspaces: `apps/web`, `apps/api`, `packages/shared`):

- `npm run dev` — web (:3000) + api (:4000) in parallel via `concurrently`
- Single workspace: `npm run dev -w apps/api`, `npm run typecheck -w apps/web`, etc.

## Architecture

- `packages/shared`: shared codes used by both apps. Ships **TypeScript source, no build step** (`main`/`exports` → `src/index.ts`). Consumers must transpile it:
  - web: `transpilePackages: ["@devpulse/shared"]` in `next.config.ts`
  - api: `tsx` in dev; `tsup --noExternal @devpulse/shared` bundles it for `build`
- `apps/api`: Express 5, ESM (`"type": "module"`), entry `src/index.ts`. Request bodies are validated with zod schemas from `packages/shared`.
- `apps/web`: Next.js 16 App Router + Tailwind 4. Never imports from `apps/api`; shared code goes in packages/shared.

## Gotchas

- Web `typecheck` is `next typegen && tsc --noEmit`: Next 16 generates global types (e.g. `LayoutProps`) that plain `tsc` can't see.
- api `lint` is just `tsc --noEmit` (no ESLint there); only web has ESLint.

## Workflow

- After a series of edits, run `npm run typecheck`, not the full build.
