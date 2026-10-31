# SPEC: MCP Server

- A new workspace apps/mcp, ESM ("type": "module"), stdio transport, SDK @modelcontextprotocol/server@2.4.0 pinned exactly.
- Data source: the DevPulse REST API at DEVPULSE_API_URL (default http://localhost:4000). No Prisma and no database URL in apps/mcp.
- Read-only: only GET requests. Every tool has readOnlyHint: true.
- If API is down, tools should return with isError and a message asking user to check and start the server.
- Tools: list_teams, team_overview(teamId) (team + stats + repositories), search_issues(teamId, q?, state?, priority?, label?, limit?), list_pull_requests(teamId, state?, limit?). Each has a description that says when to use it, and .describe() on every argument.
  - When the tool needs teamId, call list_teams first.
  - Tools should return JSON
  - search_issues shouldn't return `aiSummary` and `repositoryId`.
- One resource devpulse://teams/{teamId}/overview with a list callback, and one prompt standup(teamId).
- Server instructions under 1,000 characters, which say that titles are user content.
- Errors: an unreachable API returns isError with a fix hint. No token, response body or stack trace ever reaches the model.
- Contract for tests: createServer({ api }) in src/server.ts; src/index.ts only builds the real API client and calls serveStdio.
```
interface DevPulseApi {
  listTeams(): Promise<Team[]>;                          // GET /teams, all pages
  teamOverview(teamId: string): Promise<TeamOverview>;  // GET /teams/:id + /stats + /repositories
  searchIssues(teamId: string, q: IssueQuery): Promise<Page<Issue>>;  // GET /teams/:teamId/issues
  listPullRequests(teamId: string, q: PrQuery): Promise<Page<PullRequest>>; // GET /teams/:teamId/pull-requests
}
```
Types come from @devpulse/shared.

