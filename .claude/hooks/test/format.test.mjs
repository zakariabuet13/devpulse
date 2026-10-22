import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runHook, tempDir, write } from "./helpers.mjs";

const post = (cwd, file_path, tool_name = "Edit") => ({
  hook_event_name: "PostToolUse",
  tool_name,
  tool_input: { file_path },
  cwd,
});

test("formats a supported file and exits 0", () => {
  const dir = tempDir();
  const file = write(dir, "a.ts", "const  a = {b:1}\n");
  const r = runHook("format.mjs", post(dir, file));
  assert.equal(r.code, 0);
  assert.equal(readFileSync(file, "utf8"), "const a = { b: 1 };\n");
});

test("honours Write tool and backslash-free relative paths", () => {
  const dir = tempDir();
  write(dir, "b.json", '{"a":1,\n"b":2}');
  const r = runHook("format.mjs", post(dir, "b.json", "Write"));
  assert.equal(r.code, 0);
  assert.equal(readFileSync(join(dir, "b.json"), "utf8"), '{ "a": 1, "b": 2 }\n');
});

test("leaves files matched by .prettierignore alone", () => {
  const dir = tempDir();
  write(dir, ".prettierignore", "ignored.ts\n");
  const file = write(dir, "ignored.ts", "const  a = 1\n");
  const r = runHook("format.mjs", post(dir, file));
  assert.equal(r.code, 0);
  assert.equal(readFileSync(file, "utf8"), "const  a = 1\n");
});

test("leaves files prettier has no parser for alone", () => {
  const dir = tempDir();
  const file = write(dir, "data.unknownext", "a   b\n");
  const r = runHook("format.mjs", post(dir, file));
  assert.equal(r.code, 0);
  assert.equal(readFileSync(file, "utf8"), "a   b\n");
});

test("syntax error: file untouched, exit 0", () => {
  const dir = tempDir();
  const file = write(dir, "bad.ts", "const = = ;{\n");
  const r = runHook("format.mjs", post(dir, file));
  assert.equal(r.code, 0);
  assert.equal(readFileSync(file, "utf8"), "const = = ;{\n");
});

test("missing file, missing path, malformed stdin: all exit 0", () => {
  const dir = tempDir();
  assert.equal(runHook("format.mjs", post(dir, join(dir, "nope.ts"))).code, 0);
  assert.equal(runHook("format.mjs", { tool_input: {}, cwd: dir }).code, 0);
  assert.equal(runHook("format.mjs", "not json").code, 0);
});
