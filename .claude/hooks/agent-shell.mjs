// PreToolUse (Bash|PowerShell): shell allowlist for agents. Usage: agent-shell.mjs <review|test>. Fails closed.
import { readInput } from "./lib.mjs";

const READ_ONLY = new Set([
  "diff",
  "log",
  "show",
  "status",
  "grep",
  "ls-files",
  "blame",
  "rev-parse",
  "merge-base",
]);
const PROFILES = new Set(["review", "test"]);

// One command only: no separators, redirection, substitution or variables, and no quotes (they hide
// option names from the checks below). Newlines separate commands in both shells.
const NOT_ONE_COMMAND = /[;&|<>`$"'\x00-\x08\x0a-\x1f]/;

// Options that write a file or run a program. git accepts any unique prefix of a long option, so
// `--out=x` is `--output=x`: block every `--o*` except `--oneline`, plus `--ext*` (--ext-diff) and
// grep's `-O[<pager>]` / `--open-files-in-pager` (also reachable inside a short cluster like `-nO`).
const DANGEROUS_OPTION = /^(--o(?!neline$)|--ext|-[^-]*O)/;

// Exit 2 + stderr is the whole contract: Claude Code ignores stdout JSON on exit 2.
function deny(profile, reason) {
  process.stderr.write(`agent-shell (${profile} profile): ${reason}\n`);
  process.exit(2);
}

const profile = process.argv[2] ?? "(none)";

try {
  if (!PROFILES.has(profile))
    deny(
      profile,
      `unknown profile, expected one of: ${[...PROFILES].join(", ")}`,
    );

  const { tool_input = {} } = await readInput();
  const command = tool_input.command;
  if (typeof command !== "string" || command.trim() === "")
    deny(profile, "no command to check, blocking.");
  if (NOT_ONE_COMMAND.test(command)) {
    deny(
      profile,
      "only a single plain command is allowed (no ; & | < > backticks, $, quotes or newlines).",
    );
  }

  const [exe, sub, ...rest] = command.trim().split(/\s+/);

  if (exe === "git" && READ_ONLY.has(sub)) {
    const bad = rest.find((arg) => DANGEROUS_OPTION.test(arg));
    if (bad)
      deny(
        profile,
        `git option ${bad} can write a file or run a program, so it is blocked.`,
      );
    process.exit(0);
  }

  if (
    profile === "test" &&
    exe === "npm" &&
    sub === "test" &&
    rest[0] === "-w" &&
    (rest[1] === "apps/api" || rest[1] === "apps/mcp")
  ) {
    process.exit(0);
  }

  const allowed =
    profile === "test"
      ? "read-only git (diff, log, show, status, grep, ls-files, blame, rev-parse, merge-base) and `npm test -w apps/api` / `npm test -w apps/mcp`"
      : "read-only git (diff, log, show, status, grep, ls-files, blame, rev-parse, merge-base)";
  deny(profile, `\`${command.trim()}\` is not allowed. Allowed: ${allowed}.`);
} catch (err) {
  deny(profile, `hook failed, blocking to be safe: ${err.message}`);
}
