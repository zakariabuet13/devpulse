# DevPulse "Issues" board (apps/web)

## Context
Build `docs/design/board.png`: open issues for the selected team in 4 priority columns (Low/Medium/High/Urgent). Each card has a priority selector that moves it between columns. No API changes are needed: `PATCH /issues/:id` already accepts `{ priority }` (`updateIssueSchema`, the only writable field), and `GET /repositories/:id/issues?state=OPEN` already exists. No alert/confirm/prompt dialogs.
Decisions:
- The pure function + unit test covers **board logic** (`lib/boardLogic.ts`). The board has no PRs, and `lib/stalePrs.ts` + its tests stay as they are.
- `?view=list` is a simple table.
- Seed: **add** the design's issues next to the existing ones.

Next 16 rules (from `node_modules/next/dist/docs`, per `apps/web/AGENTS.md`):
- `searchParams` is a Promise (`PageProps<"/issues">`).
- Mutations use a `"use server"` file. Call `refresh()` from `next/cache` after the mutation (Server Actions only; our fetches are `no-store`, so no tags are needed).
- Optimistic moves use `useOptimistic` + standalone `startTransition` (the board example in `02-guides/interactive-apps.md`).
- `error.tsx` gets `retry`. The existing `app/error.tsx` already wraps `/issues`.

## Data access (server only)
- `lib/api.ts`: add `apiPatch(path, body, schema)`. It shares the error extraction with `apiGet`: factor out a `request()` helper, keep `errorMessage`.
- `lib/board.ts` (server data, not pure): `getBoard(teamId)` wrapped in `React.cache`:
  1. `fetchAll(/teams/:id/repositories)`
  2. per repo, in parallel: `fetchAll(/repositories/:id/issues?state=OPEN)` (default sort `githubCreatedAt desc`)
  3. returns `{ repoCount, issues: BoardIssue[] }`, where `BoardIssue = Issue & { repoName, repoFullName }`.
  - Total requests: 1 + repos. No aggregate endpoint exists.
- `app/issues/actions.ts` (`"use server"`): `updateIssuePriority(id: string, priority: Priority)`.
  - Validates with `updateIssueSchema` (shared) and `z.string().min(1)` for the id.
  - `apiPatch(/issues/:id, { priority }, issueSchema)`, then `refresh()`.
  - Returns `{ ok: true } | { ok: false, error: string }`, so expected failures don't hit the error boundary.

## Pure logic + unit test
`lib/boardLogic.ts` (no React and no fetch, so Vitest runs it as-is; the existing config already includes `lib/**/*.test.ts`):
- `PRIORITIES = ["LOW","MEDIUM","HIGH","URGENT"] as const`, `PRIORITY_LABEL`.
- `groupByPriority<T extends Pick<Issue,"priority">>(issues)` → `Record<Priority, T[]>`. Every key is present (empty columns render) and input order is kept.
- `filterIssues<T extends Pick<Issue,"title"|"number"|"labels"> & { repoFullName; repoName }>(issues, { query, repo, label })`.
  - Search is case-insensitive over the title, `#number` and the repo name.
  - `repo` and `label` are exact matches; an empty string means "all".
- `moveIssue(issues, { id, priority })`: the `useOptimistic` reducer. Returns a new array and leaves the input untouched.
- `collectLabels(issues)` / `collectRepos(issues)`: sorted and unique, used for the filter dropdowns.
- `labelTone(label)`: `bug` → amber, `incident` → red, everything else → neutral.
- Generics comment: `T extends Pick<…>` lets the joined rows keep their extra fields in the result, the same pattern as `getStalePrs`.

`lib/boardLogic.test.ts`:
- groups into all 4 keys, including empty ones, and keeps order
- filter by query (title, `#142`, repo name, case-insensitive), by repo, by label, combined, and with an empty query
- `moveIssue` updates only the target and doesn't mutate the input; an unknown id is a no-op
- labels/repos are deduped and sorted
- `labelTone` cases

## Components
| File | Kind | Data |
|---|---|---|
| `app/issues/page.tsx` | async server | Awaits `searchParams` (`team`, `view`). Gets `/teams` (all) and picks the team the same way as `app/page.tsx`. Renders the header "Issues" + subtitle and `TeamSelect` right away. `<Suspense>` wraps `IssuesBoardSection`. Empty-teams state is copied from `/`. |
| `app/issues/loading.tsx` | server | Header skeleton + `IssueBoardSkeleton` |
| `components/IssuesBoardSection.tsx` | async server | `getBoard(teamId)`, then passes serializable `issues`, `repoCount` and `view` to `IssueBoard`. Exports `IssueBoardSkeleton` (4 columns × 3 card placeholders). |
| `components/IssueBoard.tsx` | client | Owns `useOptimistic(issues, moveIssue)` and local filter state (query, repo, label). Toolbar: `ViewToggle`, search input, "All repositories" and "All labels" styled native `<select>`s (same pattern as `StalePrTable`), and the right-aligned mono meta "`{n} open issues · {repoCount} repositories`". Hint row: "⇄ Use a card's priority selector…" / "🔒 All other issue details are read-only". `onPriorityChange` runs inside `startTransition`: it applies the optimistic move, then awaits the action. On `{ok:false}` the card reverts on its own when the transition ends, and an inline `role="alert"` banner shows above the columns with a dismiss ×. Renders `PriorityColumn`s (board) or `IssueList` (list). Shows "No matches" when filters hide everything. |
| `components/ViewToggle.tsx` | client | Segmented Board/List control. Uses `<Link href="?view=list&team=…">` so the view survives reload. Active state comes from a prop. |
| `components/PriorityColumn.tsx` | presentational | Header: `PriorityIcon` + mono uppercase label (tone per priority) + count pill. Lists the cards; an empty column shows a muted "No issues" message. |
| `components/IssueCard.tsx` | presentational | `#n` (mono), title, `LabelChip`s, repo (`RepoIcon` + mono name), and `PrioritySelect` bottom-right |
| `components/PrioritySelect.tsx` | client | Matches the design's menu. A button (`aria-haspopup="listbox"`, `aria-expanded`) opens an absolutely positioned popover (not a dialog) headed "CHANGE PRIORITY" with 4 options, each with a bar icon and a ✓ on the current one. Keyboard: ↑/↓, Enter, Esc (returns focus to the button); closes on outside click. Selecting the current value is a no-op. |
| `components/IssueList.tsx` | presentational | Table: Priority (select) / Issue (#n + title) / Labels / Repository. Sorted Urgent→Low using the `PRIORITIES` order. |
| `components/LabelChip.tsx`, `PriorityIcon.tsx` | presentational | Chip tone comes from `labelTone`. Priority icon is 3 bars: gray/low fills 1, medium 2, high amber 3, urgent red 3. |
| `components/Sidebar.tsx` (edit) | server + small client `NavLink` | `NavLink` uses `usePathname()` for the active state. Team Health links to `/` and Issues to `/issues`; the other items stay `aria-disabled`. |
| `components/TeamSelect.tsx` (edit) | client | Pushes `${usePathname()}?team=…` instead of the hard-coded `/` (keeps `view` if present). |
| `components/icons.tsx` (edit) | — | Adds `BoardIcon`, `ListIcon`, `SwapIcon`, `LockIcon`, `CheckIcon` as inline SVGs; no new dependency |

## Seed (`apps/api/prisma/seed.ts`, data only)
- Add repo `devpulse/observability`.
- Add the design's 12 OPEN issues with matching numbers, titles, labels, priorities and repos (#142, #226, #317 Low; #508, #281, #148 Medium; #364, #512, #287, #231 High; #518, #369 Urgent). Existing issues stay.
- Keep the delete order.

## Verification
1. `npm test -w apps/web`: boardLogic and stalePrs tests pass.
2. `npm run typecheck` (root) + `npm run lint -w apps/web`.
3. `docker compose up -d` → `npm run db:seed -w apps/api` → `npm run dev`.
4. Visual check with the Claude in Chrome tools:
   - Open `http://localhost:3000/issues` in a new tab, resize to 1440 wide, screenshot, and compare with `docs/design/board.png`: sidebar active state, header + team card, toolbar, hint row, column headers/tones/count pills, card spacing, chips, selectors.
   - Open the priority menu on #369 and compare it with the dropdown in the design.
5. Interactions, each screenshotted and recorded as a GIF (`issues_board.gif`):
   - Move #142 Low→Urgent: the card jumps immediately and the counts update. Reload and confirm it persisted (cross-check with `curl localhost:4000/issues/<id>`).
   - Search ("rate", "#518"), repo filter, label filter, and the "No matches" state.
   - Keyboard-only priority change (Tab, Enter, ↓, Enter, Esc).
   - Toggle to List and back; check `?view=list` survives reload.
   - Switch team: the URL stays on `/issues`.
6. Failure path: stop the API, change a priority, and check that the card reverts and the inline banner appears (no browser dialog). Reload and check that `error.tsx` + Try again render.
7. Read console messages: no hydration warnings or errors.
8. Regression: `/` dashboard still renders, and its Open issues count goes up by the 12 new issues.
