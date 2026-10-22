import assert from "node:assert/strict";
import { join } from "node:path";
import { before, test } from "node:test";
import { makeRepo, runHook, tempDir, write } from "./helpers.mjs";

const MIG = "apps/api/prisma/migrations";
let repo;

before(() => {
  repo = makeRepo({ [`${MIG}/20240101_init/migration.sql`]: "select 1;\n" });
  write(repo, `${MIG}/20240202_new/migration.sql`, "select 2;\n"); // untracked
});

const pre = (tool_name, tool_input, cwd = repo) => ({
  hook_event_name: "PreToolUse",
  tool_name,
  tool_input,
  cwd,
});

function assertDenied(r, reasonPattern) {
  assert.equal(r.code, 2);
  const out = r.json.hookSpecificOutput;
  assert.equal(out.hookEventName, "PreToolUse");
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, reasonPattern);
  assert.match(r.stderr, reasonPattern);
}

function assertAllowed(r) {
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "");
}

test("denies Edit of a tracked migration, says how to make a new one", () => {
  const file = join(repo, MIG, "20240101_init", "migration.sql");
  assertDenied(runHook("guard.mjs", pre("Edit", { file_path: file })), /new migration/i);
});

test("denies Write of a tracked migration given with backslashes", () => {
  const file = join(repo, MIG, "20240101_init", "migration.sql").replaceAll("/", "\\");
  assertDenied(runHook("guard.mjs", pre("Write", { file_path: file })), /prisma migrate dev/);
});

test("denies a relative tracked path", () => {
  const r = runHook("guard.mjs", pre("Edit", { file_path: `${MIG}\\20240101_init\\migration.sql` }));
  assertDenied(r, /new migration/i);
});

test("allows untracked migration, including one in a new dir", () => {
  assertAllowed(runHook("guard.mjs", pre("Edit", { file_path: join(repo, MIG, "20240202_new", "migration.sql") })));
  assertAllowed(runHook("guard.mjs", pre("Write", { file_path: join(repo, MIG, "20250303_x", "migration.sql") })));
});

test("allows edits outside migrations", () => {
  assertAllowed(runHook("guard.mjs", pre("Edit", { file_path: join(repo, "apps/api/src/a.ts") })));
});

test("blocks when git state cannot be determined (not a repo)", () => {
  const dir = tempDir();
  const r = runHook("guard.mjs", pre("Edit", { file_path: join(dir, MIG, "x", "migration.sql") }, dir));
  assert.equal(r.code, 2);
  assert.equal(r.json.hookSpecificOutput.permissionDecision, "deny");
});

test("blocks on malformed stdin", () => {
  const r = runHook("guard.mjs", "not json");
  assert.equal(r.code, 2);
  assert.equal(r.json.hookSpecificOutput.permissionDecision, "deny");
});

for (const [tool, command] of [
  ["Bash", "cat .env"],
  ["Bash", "cat apps/api/.env | head"],
  ["Bash", "cp apps/api/.env.example apps/api/.env.local"],
  ["Bash", "echo X=1 >> apps/api/.env"],
  ["PowerShell", "Get-Content apps\\api\\.env"],
  ["PowerShell", "Add-Content -Path .\\.env -Value X=1"],
]) {
  test(`denies ${tool}: ${command}`, () => {
    assertDenied(runHook("guard.mjs", pre(tool, { command })), /CLAUDE\.md/);
  });
}

for (const [tool, command] of [
  ["Bash", "cat apps/api/.env.example"],
  ["PowerShell", "Get-Content apps\\api\\.env.example"],
  ["Bash", 'node -e "console.log(process.env.HOME)"'],
  ["Bash", "npm run typecheck"],
]) {
  test(`allows ${tool}: ${command}`, () => {
    assertAllowed(runHook("guard.mjs", pre(tool, { command })));
  });
}
