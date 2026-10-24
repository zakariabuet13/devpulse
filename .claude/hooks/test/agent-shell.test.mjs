import assert from "node:assert/strict";
import { test } from "node:test";
import { runHook } from "./helpers.mjs";

const pre = (tool_name, command) => ({
  hook_event_name: "PreToolUse",
  tool_name,
  tool_input: { command },
  cwd: process.cwd(),
});

const run = (profile, tool, command) =>
  runHook("agent-shell.mjs", pre(tool, command), { args: [profile] });

function assertDenied(r, reasonPattern) {
  assert.equal(r.code, 2);
  assert.equal(r.stdout.trim(), ""); // exit 2 uses stderr only; stdout JSON would be ignored
  assert.match(r.stderr, reasonPattern);
}

function assertAllowed(r) {
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "");
}

const READ_ONLY = [
  "git diff",
  "git diff main...HEAD",
  "git diff --stat",
  "git log --oneline -n 5",
  "git show HEAD~1",
  "git status --short",
  "git grep -n parseInput -- apps/api",
  "git ls-files apps/api",
  "git blame apps/api/src/app.ts",
  "git rev-parse HEAD",
  "git merge-base main HEAD",
];

for (const profile of ["review", "test"]) {
  for (const command of READ_ONLY) {
    for (const tool of ["Bash", "PowerShell"]) {
      test(`${profile} allows ${tool}: ${command}`, () => {
        assertAllowed(run(profile, tool, command));
      });
    }
  }

  for (const command of [
    // not on the allowlist
    "git commit -m x",
    "git push",
    "git checkout main",
    "git reset --hard",
    "git branch -D x",
    "git config user.name x",
    "git -c core.pager=calc log", // global option, not a subcommand
    "git",
    "ls",
    "cat package.json",
    "node -e 1",
    "rm -rf .",
    "",
    // more than one command, or redirection / substitution
    "git status; rm -rf .",
    "git status && git push",
    "git status & git push",
    "git log | head",
    "git diff > out.txt",
    "git diff < in.txt",
    "git log `whoami`",
    "git log $(whoami)",
    "git log $HOME",
    "git status\ngit push",
    "git status\r\ngit push",
    'git log "--output=x"', // quoting hides option names
    "git log '--output=x'",
    // options that make git write a file or run a program
    "git diff --output=out.txt",
    "git log --output=out.txt",
    "git show --output out.txt",
    "git diff --out=out.txt", // git accepts unique prefixes of long options
    "git log --outp=out.txt",
    "git diff --o=out.txt",
    "git grep -O vim foo",
    "git grep -Ovim foo",
    "git grep --open-files-in-pager=vim foo",
    "git grep --open=vim foo",
    "git diff --ext-diff",
  ]) {
    test(`${profile} denies: ${JSON.stringify(command)}`, () => {
      assertDenied(
        run(profile, "Bash", command),
        new RegExp(`\\b${profile}\\b`),
      );
    });
  }
}

test("review denies npm test, test allows it", () => {
  assertDenied(run("review", "Bash", "npm test -w apps/api"), /\breview\b/);
  assertAllowed(run("test", "Bash", "npm test -w apps/api"));
  assertAllowed(run("test", "PowerShell", "npm test -w apps/api"));
});

test("test allows npm test with arguments", () => {
  assertAllowed(
    run("test", "Bash", "npm test -w apps/api -- test/teams.test.ts"),
  );
  assertAllowed(
    run("test", "Bash", "npm test -w apps/api -- test\\teams.test.ts"),
  );
});

for (const command of [
  "npm test",
  "npm test -w apps/web",
  "npm test -w apps/api; rm -rf .",
  "npm test -w apps/api && git push",
  "npm test -w apps/api > out.txt",
  "npm run db:reset -w apps/api",
  "npm install",
  "npx vitest",
]) {
  test(`test denies: ${command}`, () => {
    assertDenied(run("test", "Bash", command), /\btest\b/);
  });
}

test("denies an unknown or missing profile", () => {
  assertDenied(run("admin", "Bash", "git status"), /admin|profile/i);
  assertDenied(
    runHook("agent-shell.mjs", pre("Bash", "git status")),
    /profile/i,
  );
});

test("denies when command is missing or not a string", () => {
  assertDenied(
    runHook(
      "agent-shell.mjs",
      { tool_name: "Bash", tool_input: {} },
      { args: ["review"] },
    ),
    /\breview\b/,
  );
  assertDenied(
    runHook(
      "agent-shell.mjs",
      { tool_name: "Bash", tool_input: { command: ["git", "status"] } },
      { args: ["review"] },
    ),
    /\breview\b/,
  );
});

test("denies on malformed stdin", () => {
  assertDenied(
    runHook("agent-shell.mjs", "not json", { args: ["review"] }),
    /agent-shell|review/,
  );
  assertDenied(
    runHook("agent-shell.mjs", "", { args: ["test"] }),
    /agent-shell|test/,
  );
});
