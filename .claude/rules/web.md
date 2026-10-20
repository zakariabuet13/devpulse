---
paths: ["apps/web/**"]
---

# WEB (apps/web)

- Use `npm run typecheck` for web's typechecking, which is `next typegen && tsc --noEmit`. Next 16 generates global types (e.g. `LayoutProps`) that plain `tsc` can't see.
- Call the API via apiGet/apiPatch/fetchAll in lib/api.ts; errorMessage there normalizes error (array | string | object).

<!-- Native popups freeze Claude in Chrome -->
- Don't use any JS native alert/confirm/prompt in the UI.
- Web `lint` uses ESLint.
