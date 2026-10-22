import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BOM, git, makeRepo, runHook, write } from "./helpers.mjs";

const MIG = "apps/api/prisma/migrations";
const stop = (cwd, extra = {}) => ({ hook_event_name: "Stop", cwd, stop_hook_active: false, ...extra });
const repoWith = () => makeRepo({ [`${MIG}/1_init/migration.sql`]: "select 1;\n", "src/ok.ts": "x\n" });

test("clean tree: exit 0, silent", () => {
  const r = runHook("tree-check.mjs", stop(repoWith()));
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "");
});

test("blocks on BOM in untracked file inside a new dir, listing it", () => {
  const repo = repoWith();
  write(repo, "new/deep/bom.ts", BOM + "x\n");
  write(repo, "new/deep/fine.ts", "x\n");
  const r = runHook("tree-check.mjs", stop(repo));
  assert.equal(r.code, 0);
  assert.equal(r.json.decision, "block");
  assert.match(r.json.reason, /new\/deep\/bom\.ts/);
  assert.doesNotMatch(r.json.reason, /fine\.ts/);
});

test("blocks on BOM in modified tracked file", () => {
  const repo = repoWith();
  write(repo, "src/ok.ts", BOM + "changed\n");
  const r = runHook("tree-check.mjs", stop(repo));
  assert.equal(r.json.decision, "block");
  assert.match(r.json.reason, /src\/ok\.ts/);
});

test("blocks on modified tracked migration (even via a rename route or delete)", () => {
  const repo = repoWith();
  write(repo, `${MIG}/1_init/migration.sql`, "select 99;\n");
  let r = runHook("tree-check.mjs", stop(repo));
  assert.equal(r.json.decision, "block");
  assert.match(r.json.reason, /1_init\/migration\.sql/);

  git(repo, "checkout", "--", ".");
  rmSync(join(repo, MIG, "1_init", "migration.sql"));
  r = runHook("tree-check.mjs", stop(repo));
  assert.equal(r.json.decision, "block");
  assert.match(r.json.reason, /1_init\/migration\.sql/);

  git(repo, "checkout", "--", ".");
  git(repo, "mv", `${MIG}/1_init/migration.sql`, `${MIG}/1_init/renamed.sql`);
  r = runHook("tree-check.mjs", stop(repo));
  assert.equal(r.json.decision, "block");
});

test("allows new untracked migration, and a deleted non-BOM file", () => {
  const repo = repoWith();
  write(repo, `${MIG}/2_add/migration.sql`, "select 2;\n");
  rmSync(join(repo, "src/ok.ts"));
  const r = runHook("tree-check.mjs", stop(repo));
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "");
});

test("allows a staged new migration (git add), still blocks edits to committed ones", () => {
  const repo = repoWith();
  write(repo, `${MIG}/2_add/migration.sql`, "select 2;\n");
  git(repo, "add", "-A");
  let r = runHook("tree-check.mjs", stop(repo));
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "");

  write(repo, `${MIG}/1_init/migration.sql`, "select 99;\n");
  r = runHook("tree-check.mjs", stop(repo));
  assert.equal(r.json.decision, "block");
  assert.match(r.json.reason, /1_init/);
  assert.doesNotMatch(r.json.reason, /2_add/);
});

test("stop_hook_active: warns via systemMessage instead of blocking", () => {
  const repo = repoWith();
  write(repo, "bom.ts", BOM + "x\n");
  const r = runHook("tree-check.mjs", stop(repo, { stop_hook_active: true }));
  assert.equal(r.code, 0);
  assert.equal(r.json.decision, undefined);
  assert.match(r.json.systemMessage, /bom\.ts/);
});

test("not a git repo: exit 0, silent", () => {
  const r = runHook("tree-check.mjs", stop(process.env.TEMP ?? "/"));
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "");
});
