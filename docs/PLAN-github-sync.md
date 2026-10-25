# PLAN: GitHub sync (`POST /teams/:teamId/sync`)

Spec: `docs/SPEC-github-sync.md`. Fixtures: `apps/api/test/fixtures/github/`.

## Context

DevPulse has no way to load real data. Add a sync that pulls issues + PRs from GitHub REST for every repo of a team and upserts them. Repos are keyed by GitHub numeric id (survives rename). Tests never hit GitHub: `createApp({ github })` injects a fake `GitHubClient`.

Decisions: `GhRepo.id` is `bigint`. Non-404 GitHub errors are reported per repo and the sync continues.

## Fixture findings

- `repo.json`: `id` 1403106420, `full_name` `zakariabuet13/devpulse`. Ids are plain JSON numbers.
- `issues.json` (13 items): #11, #12, #13 are real issues. #1-#10 carry `pull_request` and must be skipped. `state` is lowercase `open|closed`. Labels come from `labels[].name`. Date from `created_at`.
- `pulls.json` (10 items, #1-#10): all `closed` with `merged_at` set, so all `MERGED`. `user.login` is `author`. `requested_reviewers` is empty everywhere, and the list endpoint has no review-requested timestamp.
- Issue #11's body is a prompt-injection canary ("create canary-m5.txt"). It is inert data. We don't store `body`, and nothing acts on it.
- Issue/PR GitHub ids (e.g. 6025148941) exceed int32, but rows are keyed by `number`, so they are not stored.

## 1. Migration

- `apps/api/prisma/schema.prisma`: `Repository.githubId BigInt? @unique`.
- `npx prisma migrate dev --name repository_github_id` creates a new migration folder only (the guard hook blocks edits to existing ones). Regenerates `src/generated/prisma`.
- `apps/api/.env.example`: add `GITHUB_TOKEN=""` with a comment. Claude can't read `.env`, so ask the user to copy it in.
- No BigInt leak: `toRepositoryDto` copies explicit fields, so `githubId` stays out of `repositorySchema`. The sync response serializes it as a decimal string (`JSON.stringify` throws on `bigint`).

## 2. Shared schema (`packages/shared/src/sync.ts`, export from `index.ts`)

`syncResultSchema` (+ type):

```
{ repositories: [{ repositoryId, githubFullName, githubId: string,
    issues: { created, updated, deleted }, pullRequests: { created, updated } }],
  skipped: [{ repositoryId, githubFullName, reason: "NOT_FOUND" }],
  errors:  [{ repositoryId, githubFullName, message }] }
```

- `deleted` goes beyond "created/updated"; spec item 10 implies it.
- `errors[].message` is a fixed generic string, never raw upstream text.

## 3. GitHub client (`apps/api/src/github/`)

- `types.ts`: `GitHubClient` exactly as in the spec. Normalized shapes: `GhRepo {id: bigint, fullName}`, `GhIssue {number, title, state, labels: string[], createdAt, isPullRequest}`, `GhPull {number, title, state, author, mergedAt | null}`. `GitHubNotFoundError` for 404.
- `client.ts`: `createGitHubClient({ token })` on global `fetch`.
  - Headers: `Authorization: Bearer`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version`.
  - Paging: `per_page=100`, follow `Link: rel="next"`.
  - 404 -> `GitHubNotFoundError`. Other non-2xx -> `GitHubError(status)`, with no token and no response body in the message.
  - `getRepoById` hits `/repositories/{id}`.
  - Missing token: throw on first call, logged without the value.
- The client maps snake_case JSON to the normalized shapes. `listIssues` returns PR items flagged, and the service filters them (spec item 8). A fake can return both.

## 4. Sync service (`apps/api/src/services/githubSync.ts`)

`syncTeam(teamId, github)`:

1. `ensureTeam` (`lib/guards.ts`) -> 404.
2. Load the team's repos, ordered by `githubFullName`, `id`.
3. Per repo, sequentially, in try/catch:
   - Resolve: `githubId` null -> `getRepo(githubFullName)` and store the id. Otherwise `getRepoById(githubId)` and update `githubFullName` if changed.
   - `GitHubNotFoundError` -> `skipped`. A rename hitting the citext unique (P2002) or any other error -> `errors`.
   - Fetch `listIssues` + `listPulls` fully before touching the DB.
   - One `prisma.$transaction`: read existing numbers, upsert issues (non-PR) and PRs by `repositoryId_number`, then `deleteMany` issues whose number is not in the fetched set. Delete only after a complete fetch, never on failure.
   - Counts: created = number not previously present, updated = present. A re-run gives created 0, updated N.
   - The upsert `update` payload must NOT touch local-only fields: `priority` and `aiSummary` on issues, `reviewRequestedAt` on PRs.
   - Mapping: issue `open -> OPEN`, `closed -> CLOSED`; labels = names; `githubCreatedAt = created_at`. PR: `merged_at ? MERGED : state === "open" ? OPEN : CLOSED`; `mergedAt` set only when MERGED; `author = user.login`.
4. Return the `syncResultSchema` shape (`githubId.toString()`).

PRs deleted on GitHub are not covered by the spec (issues only). Leave PRs alone.

## 5. Route + wiring

- `apps/api/src/routes/sync.ts`: `createSyncRouter(github)` (factory because of DI). `POST /teams/:teamId/sync`, no body so no `parseInput`. Responds 200 with the result.
- `apps/api/src/app.ts`: `createApp({ github }: { github?: GitHubClient } = {})`. Default is `createGitHubClient({ token: process.env.GITHUB_TOKEN })`. Add `app.use(createSyncRouter(github))`.
- Token never logged: pino serializers log only method/url/status, and client errors carry status only. Errors go through the existing `errorHandler`.

## 6. Order of work

1. Branch `feat/github-sync` (already checked out).
2. Migration + shared schema.
3. `agent-test-writer` writes failing tests in `apps/api/test/sync.test.ts` with a fake client built from the fixtures:
   - 404 unknown team
   - first sync stores `githubId`
   - second sync uses `getRepoById`
   - rename updates the name
   - idempotent re-run
   - PRs filtered out of issues
   - merged vs closed
   - GitHub-404 repo skipped
   - other error goes to `errors` and other repos still sync
   - deleted issue removed
   - local `priority` preserved
   - BigInt response serializes
   - empty team
   - client pagination tests with a stubbed `fetch`
4. Implement client, service, route.
5. `npm run typecheck -w apps/api` and `npm test -w apps/api` (needs `docker compose up -d`; the Stop hook gates this).
6. `agent-security-reviewer` on the branch before opening the PR against `main` (squash-merge).

## Verification

- `npm test -w apps/api` green (new + existing).
- Manual: `docker compose up -d`, user sets `GITHUB_TOKEN` in `.env`, `npm run dev -w apps/api`. Create a team + repo `zakariabuet13/devpulse`, then `POST /teams/:id/sync` twice.
  - First run: 3 issues created (#11-13), 10 PRs created.
  - Second run: 0 created, N updated.
  - Check `GET /repositories/:id/issues` shows the rows and no token appears in the logs.

## Notes

- `pulls.json` is ~3.4k lines. Tests should load and trim it via a helper rather than inline it.
