---
paths: ["apps/web/**"]
---

# WEB (apps/web)

- Use `npm run typecheck` for web's typechecking, which is `next typegen && tsc --noEmit`. Next 16 generates global types (e.g. `LayoutProps`) that plain `tsc` can't see.
- Handle `error` as array | string | object (`apiErrorSchema` in shared).

<!-- Native popups freeze Claude in Chrome -->
- Don't use any JS native alert/confirm/prompt in the UI. They freeze Claude in Chrome.