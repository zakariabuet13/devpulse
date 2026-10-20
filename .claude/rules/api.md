---
paths: ["apps/api/**"]
---

# API (apps/api)

- api input (body, query) must go through `parseInput`
- Treat a raw `ZodError` reaching the error handler is a server bug and return a 500.
- Never mutate `req.query` (Express 5 getter).
- Use `meta.driverAdapterError.cause.constraint.index` for getting Prisma unique violations under adapter-pg instead of`meta.target`.
- Error contract (`src/middleware/errorHandler.ts`, `src/errors.ts`): handlers throw, Express 5 forwards async rejections.
  - Validation: `400 { error: ZodIssue[] }` in every env.
  - Everything else: prod `{ error: "<message>" }`; dev `{ error: { code, message, stack } }` (`NODE_ENV`). Codes: `BAD_REQUEST`, `NOT_FOUND`, `CONFLICT`, `INTERNAL` (500 message is always "Internal server error").
- api `lint` is just `tsc --noEmit` (no ESLint there)