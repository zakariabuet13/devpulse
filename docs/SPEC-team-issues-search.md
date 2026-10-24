# DevPulse "Issues" search (apps/api)

- Add a new api `GET /teams/:teamId/issues`
- Query: q (optional, trimmed, 1–100 chars, case-insensitive substring of the title; % and _ are literal characters), plus the existing state, priority, label, sort, order, limit, offset. Reuse the issue list query schema.
- Only issues in repositories of that team. An issue from another team's repository must never appear, even when it matches q.
- 404 for an unknown team, 400 for invalid input, Page<Issue> with the { id: "asc" } tie-breaker.


