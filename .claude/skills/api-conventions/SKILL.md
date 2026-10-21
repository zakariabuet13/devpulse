---
name: api-conventions
description: "How a DevPulse endpoint is built (router, shared schema, DTO/Page, tests). Use when planning, adding or changing anything in apps/api or packages/shared."
user-invocable: false
---

## Route anatomy
One router per resource in `src/routes/`, registered in `app.ts`; `ensureTeam`/`rethrowMissing` from `lib/guards.ts` for 404s.

## Schemas
One shared file per model in `packages/shared/src/`, exported from `index.ts`. Reuse an existing query schema before adding one.

## Responses
DTO mappers in `dto.ts` (Date → ISO). Lists return `Page<T>` through `pageArgs`/`page`, with an `{ id: "asc" }` tie-breaker last in `orderBy`.

## Tests
One describe per route in `apps/api/test/`, factories from `factories.ts`, `it.each` for 400 cases, boundary values for any limit or time window.
