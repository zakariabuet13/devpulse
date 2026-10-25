# SPEC: DevPulse GitHub Sync

- Route: `POST /teams/:teamId/sync`. For each repository of that team, it reads issues and PRs from GitHub's REST API and saves them in the database. 404 for an unknown team. The route should return the synced repos, count of created and updated issues and PRs for each repo.
- If a repo returns 404 from GitHub, skip it and report it.
- Upsert issues and PRs by `(repositoryId, number)`. "Upsert" means insert the row if it's new, and update it if it already exists. Running the sync twice must give the same rows 
- Repositories are keyed by GitHub's number, not their name. Add `githubId BigInt? @unique` to `Repository`. On the first sync, look the repo up by name and store its id. On later syncs, look it up by id (`GET /repositories/{id}`) and update `githubFullName` if it changed. Why: a repo can be renamed or moved to another owner, but its id never changes.
- Use BigInt. Postgres `integer` stops at `2147483647`, so it doesn't fit. Also note that `JSON.stringify` throws on a JS `bigint`.
- The issues endpoint also returns PRs. In GitHub's REST API, `/issues` lists pull requests too, marked with a `pull_request` field. Skip those items; PRs come from `/pulls`. A PR whose `merged_at` is set is `MERGED`.
- Token: `GITHUB_TOKEN` in `apps/api/.env`. Add it to `.env.example`, because Claude can't read `.env`. It's never logged, and never in an error response.
- If an issue was synced before but has since been deleted on GitHub, delete it here as well.
- Tests never call GitHub. `createApp({ github })` takes a client with this shape, so tests can pass a fake one. This shape is the contract that the test writer and the implementer both follow:
```
interface GitHubClient {
  getRepo(fullName: string): Promise<GhRepo>;       // GET /repos/{owner}/{repo}
  getRepoById(id: bigint): Promise<GhRepo>;         // GET /repositories/{id}
  listIssues(fullName: string): Promise<GhIssue[]>; // GET /repos/{o}/{r}/issues?state=all, all pages
  listPulls(fullName: string): Promise<GhPull[]>;   // GET /repos/{o}/{r}/pulls?state=all, all pages
}
```