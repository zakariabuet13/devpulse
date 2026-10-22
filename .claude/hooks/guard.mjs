// PreToolUse (Edit|Write|Bash|PowerShell): protect committed migrations and .env. Fails closed.
import { existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { MIGRATIONS, git, readInput, toSlashes } from "./lib.mjs";

// `.env` as its own path segment/word, but not `.env.example` and not `process.env`.
const ENV_FILE = /(?<!\w)\.env(?!\w)(?!\.example(?!\w))/i;

// Free text that is never executed: the value of -m/--message/--title/--body when it is a
// single-quoted string, a double-quoted string without `$`/backtick expansion, or a
// `$(cat <<'EOF' ... EOF)` heredoc (quoted delimiter => no expansion). Blanked before ENV_FILE
// runs so a commit message or PR title can mention .env. Anything else stays visible (fail closed).
const INERT_TEXT =
  /(?<![\w-])(-m|--message|--title|--body)(?:=|\s+)(?:"\$\(cat <<'(\w+)'\r?\n[\s\S]*?\r?\n\2\r?\n?\)"|"(?:[^"\\$`]|\\.)*"|'[^']*')/g;

function stripInertText(command) {
  return command.replace(INERT_TEXT, '$1 ""');
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }) + "\n",
  );
  process.stderr.write(reason + "\n");
  process.exit(2);
}

function isTracked(abs) {
  let dir = dirname(abs);
  while (!existsSync(dir)) dir = dirname(dir); // new files may sit in dirs that don't exist yet
  const r = git(dir, ["ls-files", "--error-unmatch", "--", relative(dir, abs)]);
  if (r.status === 0) return true;
  if (r.status === 1) return false; // pathspec matched nothing => untracked
  throw new Error(r.stderr);
}

try {
  const { tool_name, tool_input = {}, cwd = process.cwd() } = await readInput();

  if (tool_name === "Edit" || tool_name === "Write") {
    const file = toSlashes(String(tool_input.file_path ?? ""));
    if (MIGRATIONS.test(file) && isTracked(resolve(cwd, file))) {
      deny(
        `${file} is a committed migration and must never be edited. ` +
          "Make a new migration instead: change schema.prisma, then run `npx prisma migrate dev --name <change>` in apps/api.",
      );
    }
  } else if (tool_name === "Bash" || tool_name === "PowerShell") {
    if (
      ENV_FILE.test(stripInertText(toSlashes(String(tool_input.command ?? ""))))
    ) {
      deny(
        "Shell commands must not touch .env (see the Gotchas line in CLAUDE.md): " +
          "add new env vars to apps/api/.env.example and ask the user to copy them into .env.",
      );
    }
  }
} catch (err) {
  deny(`guard hook failed, blocking to be safe: ${err.message}`);
}
