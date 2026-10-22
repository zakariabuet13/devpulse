# DevPulse Hooks

Run the hook tests with `npm run test:hooks`.

## Format every code file after edited
Event: PostToolUse
Matcher: Edit|Write
What it does: Formats the edited file through the Prettier API if Prettier supports it and it isn't ignored. Uses format.mjs.
What it returns: Exits 0
On failure: Does nothing and exits 0, because Claude may be in the middle of a multi-step edit.

## Never edit a committed migration; never touch .env from a shell command
Event: PreToolUse
Matcher: Edit|Write|Bash|PowerShell
What it does: Denies Edit/Write to a file under apps/api/prisma/migrations/ that exists in HEAD, with a reason that says how to make a new migration. Allows untracked and staged-only (not yet committed) ones. The path is resolved first, so `..` segments and backslashes don't dodge it. Denies any shell command whose text mentions .env other than .env.example, with a reason pointing to the CLAUDE.md line. Uses guard.mjs.
What it returns: Exits 2 with the reason on stderr (stdout JSON is ignored on exit 2, so none is printed).
On failure: Blocks (fails closed): any crash or unreadable git state denies the call, and `onFailure: "block"` covers a script that cannot start.
Limits: the .env check is a text match, best effort. `cat apps/api/.e""nv` or a wildcard like `.en*` gets past it. The real wall is the `Read(.env)` deny rule in settings.json; this hook only closes the obvious shell routes.

## No UTF-8 BOM in any changed file; No committed migration modified by any route
Event: Stop
Matcher: N/A
What it does: From git status --porcelain, blocks when a changed or untracked file starts with a BOM, or when a committed migration is modified (staged-new and untracked migrations are fine), listing the files. If stop_hook_active is true, it doesn't block again; it warns you with systemMessage instead. Uses tree-check.mjs.
What it returns: The blocking reason as JSON `decision: "block"`, exit 0.
On failure: Fails open: not a git repo, git missing or a script crash means exit 0, so a broken hook can't trap the session.

## Typecheck and API tests green before a turn that changed the API ends
Event: Stop
Matcher: N/A
What it does: if nothing changed under apps/api/ or packages/shared/, or the change fingerprint matches the last green run (stored under scratchpad_dir), it exits 0 straight away. Otherwise it runs npm run typecheck and npm test -w apps/api. Green: store the fingerprint. Red: block with the last ~40 lines of the failure. Postgres unreachable: don't block; tell you to run docker compose up -d. stop_hook_active and still red: warn, don't block. For the same fingerprint, steps that already passed are not re-run, so a retry after docker starts only repeats the tests. Only apps/api and packages/shared are gated; run `npm run typecheck -w apps/web` yourself after web edits. Uses test-gate.mjs.
What it returns: The blocking reason as JSON `decision: "block"`, exit 0.
On failure: Fails open: a crash of the hook itself (not a git repo, bad DEVPULSE_GATE_COMMANDS, cache write error) means exit 0. Opposite of the guard, because a Stop hook that can't run must not trap the session.
