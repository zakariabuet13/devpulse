# DevPulse Hooks

## Format every code file after edited
Event: PostToolUse
Matcher: Edit|Write
What it does: Formats the edited file through the Prettier API if Prettier supports it and it isn't ignored. Uses format.mjs.
What it returns: Exits 0
On failure: Does nothing and exits 0, because Claude may be in the middle of a multi-step edit.

## Never edit a commited migration; never touch .env from a shell command
Event: PreToolUse
Matcher: Edit|Write|Bash|PowerShell
What it does: Denies Edit/Write to a git-tracked file under apps/api/prisma/migrations/, with a reason that says how to make a new migration. Allows untracked ones. Denies any shell command whose text mentions .env other than .env.example, with a reason pointing to the CLAUDE.md line. Uses JSON permissionDecision, and normalises backslashes. Uses guard.mjs.
What it returns: Exits 2, with the blocking reason.
On failure: Block. 

## No UTF-8 BOM in any changed file; No committed migration modified by any route
Event: Stop
Matcher: N/A
What it does: From git status --porcelain, blocks when a changed or untracked file starts with a BOM, or when a tracked migration is modified, listing the files. If stop_hook_active is true, it doesn't block again; it warns you with systemMessage instead. Uses tree-check.mjs.
What it returns: The blocking reason.
On failure: N/A

## Typecheck and API tests green before a turn that changed the API ends
Event: Stop
Matcher: N/A
What it does: if nothing changed under apps/api/ or packages/shared/, or the change fingerprint matches the last green run (stored under scratchpad_dir), it exits 0 straight away. Otherwise it runs npm run typecheck and npm test -w apps/api. Green: store the fingerprint. Red: block with the last ~40 lines of the failure. Postgres unreachable: don't block; tell you to run docker compose up -d. stop_hook_active and still red: warn, don't block. Uses test-gate.mjs.
What it returns: The blocking reason.
On failure: N/A
