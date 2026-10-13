# DevPulse "Team Health" dashboard (apps/web)

## Context
`apps/web/app/page.tsx` is a placeholder. Build the dashboard in `docs/design/dashboard.png` against the existing API, **no API changes**. Decisions:
- Fields API lacks (PR draft, branch name, approval) → **degrade UI**: Open PRs subline = "Across N repositories"; row subline = `#482` only; "awaiting review" = `OPEN && reviewRequestedAt != null`, subline "Review requested".
- Visual test data → **extend `apps/api/prisma/seed.ts`** (data only, no schema/endpoint change).

Next 16 rules (from `node_modules/next/dist/docs`): `searchParams` is a Promise (type page with global `PageProps<"/">`); `error.tsx` must be `"use client"` and gets `{ error, retry }` (not `reset`); `fetch` uncached by default; stream with `loading.tsx` / `<Suspense>`.

## Data access (server only)
- `apps/web/lib/api.ts`
  - `apiGet(path, schema)`: `fetch(${API_URL}${path})`, `API_URL` from env, default `http://localhost:4000`; parse with the shared zod schema; non-OK → throw `Error` with message pulled from `error` (array | string | object, per `apiErrorSchema` contract).
  - `fetchAll(path, itemSchema)`: page through `limit=100&offset=…` until `offset >= total` (API max limit is 100). Built on `paginated()` from `packages/shared/src/common.ts`.
- `apps/web/lib/dashboard.ts` — `getDashboard(teamId)` wrapped in `React.cache`:
  1. parallel: `GET /teams/:id/repositories` (all), `GET /teams/:id/members` (all)
  2. per repo, parallel: `GET /repositories/:id/issues?state=OPEN&limit=1` → `total` only; `GET /repositories/:id/pull-requests?state=OPEN&sort=reviewRequestedAt&order=asc` (all)
  3. returns counts + joined stale rows (`repoName` = part after `/` of `githubFullName`, `authorName` from member whose `githubLogin` matches case-insensitively, else fall back to login).
  - Fan-out = 2 + 2×repos requests; acceptable at this scale, no aggregate endpoint exists.
- `apps/web/.env.example`: `API_URL=http://localhost:4000` (the default works without copying it).

## Stale-PR logic (pure + unit test)
`apps/web/lib/stalePrs.ts`
- `STALE_THRESHOLD_MS = 3 days`
- `getStalePrs(prs, now: Date, thresholdMs?)` → `{ pr, ageMs }[]`: keeps `state === "OPEN"` and `reviewRequestedAt` non-null with `now - requested > threshold` (strictly greater, matching "> 3 days"); sorted oldest first. Generic `<T extends Pick<PullRequest, "state" | "reviewRequestedAt">>` so joined rows pass straight through and come back with their extra fields (explained in a code comment).
- `formatAge(ms)` → `"7d 2h"`; `formatRequestedAt(iso)` → `"Oct 06, 08:00 UTC"` (`Intl.DateTimeFormat`, `timeZone: "UTC"`, so server and client render the same).
- `apps/web/lib/stalePrs.test.ts` (Vitest, fixed `now`): excludes CLOSED/MERGED, null `reviewRequestedAt`, exactly 3d (boundary), 2d23h; includes 3d+1min; sort order; empty input; `formatAge`/`formatRequestedAt` cases.
- Add `vitest` devDep + `"test": "vitest run"` to `apps/web/package.json`; small `apps/web/vitest.config.ts` (include `lib/**/*.test.ts`).
- `now` is taken once on the server; ages are computed there and passed to the client, so there's no hydration mismatch.

## Components (in `apps/web/components/`, page in `app/`)
| Component | Kind | Data |
|---|---|---|
| `app/layout.tsx` (edit) | server | none. Title "DevPulse", renders `TopBar` + `Sidebar` around `children`; body uses `--font-sans` (Geist); light theme only (drop the dark `prefers-color-scheme` block in `globals.css`) |
| `TopBar` | server | static: logo, "GitHub connected" label, bell (decorative), "JD" avatar |
| `Sidebar` | server | static nav. Team Health active (`/`); Issues / Pull Requests / Repositories / Settings / Help render as `aria-disabled` items, since those routes don't exist yet |
| `app/page.tsx` | async server | `await searchParams` → `team` id; `GET /teams` (all); picks the `?team=` match or the first team; header + `TeamSelect` render right away; stats + table are wrapped in `<Suspense>` |
| `TeamSelect` | client | props `teams`, `selectedId`; on change `router.push("/?team=<id>")`. Styled native `<select>` so it's accessible and needs no dialogs |
| `DashboardStats` | async server | `getDashboard(teamId)` → 4× `StatCard` |
| `StatCard` | server, presentational | `label, value, subline, icon, tone?: "warning"` (amber variant for Stale PRs). Cards: Open issues (sum of totals, "Across N repositories"), Open PRs (count, "Across N repositories"), Awaiting review (OPEN+requested, "Review requested"), Stale PRs ("Review requested > 3 days ago") |
| `StalePrSection` | async server | `getDashboard(teamId)` (same `React.cache` result, no refetch) → passes serializable rows to `StalePrTable` |
| `StalePrTable` | client | local state only: search (title, #number, repo, author name/login), repo filter `<select>` (from rows' repos), sort toggle "Oldest request first" / "Newest request first". Header with count badge plus "Open in GitHub" link (`https://github.com/<full>/pulls` when one repo is filtered, else `https://github.com/pulls/review-requested`). Rows: repo, title + `#n`, `Avatar` + name + `@login`, clock + `formatAge` + `formatRequestedAt`, ↗ link to `https://github.com/<full>/pull/<n>` (`target=_blank rel=noopener noreferrer`). Empty states: "No stale PRs 🎉" and "No matches" |
| `Avatar` | server | initials from name |
| `icons.tsx` | — | inline SVGs, no new dependency |
| `app/loading.tsx` / Suspense fallbacks | server | skeleton cards + rows |
| `app/error.tsx` | client | message + "Try again" button calling `retry()`. No alert/confirm/prompt anywhere |

Empty team list → friendly empty state (no crash).

## Seed data (`apps/api/prisma/seed.ts`)
- Add repos (e.g. `devpulse/infra`, `devpulse/auth-service`) and 2–3 members.
- Add ~6 OPEN PRs with `reviewRequestedAt` 3.3–8 days ago (use hour offsets, not exactly 3d), one by a login that isn't a member (exercises the fallback), plus a few non-stale OPEN PRs and OPEN issues spread across repos.
- Keep the existing delete order (PRs, issues, repos, members, teams).

## Verification
1. `npm test -w apps/web`: stalePrs unit tests pass.
2. `npm run typecheck` (root) + `npm run lint -w apps/web`.
3. `docker compose up -d` → `npm run db:seed -w apps/api` → `npm run dev`.
4. Visual: use the Claude in Chrome browser tools to open `http://localhost:3000` at a 1440-wide window, screenshot it, and compare side by side with `docs/design/dashboard.png` (layout, spacing, amber stale card, table columns). Then exercise and screenshot: search filter, repo filter, sort toggle, team switch (`?team=`), empty search result. Check the console for hydration warnings / errors. Stop the API to confirm `error.tsx` + retry renders. Record a GIF of the interactions.
5. Spot-check counts against the API with `curl` (`/repositories/:id/pull-requests?state=OPEN`).
