import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { makeRepo, runHook, tempDir, write } from "./helpers.mjs";

let repo, scratch, fx;

// Fixture command: appends its name to ran.log, prints `out`, exits `code`.
function cmd(name, { code = 0, out = "" } = {}) {
  const script = write(
    fx,
    `${name}.mjs`,
    `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(join(fx, "ran.log"))}, "${name}\\n");
process.stdout.write(${JSON.stringify(out)});
process.exit(${code});
`,
  );
  return `"${process.execPath}" "${script}"`;
}

const ran = () => (existsSync(join(fx, "ran.log")) ? readFileSync(join(fx, "ran.log"), "utf8").trim().split("\n") : []);
const input = (extra = {}) => ({ hook_event_name: "Stop", cwd: repo, scratchpad_dir: scratch, stop_hook_active: false, ...extra });
const gate = (cmds, extra) => runHook("test-gate.mjs", input(extra), { env: { DEVPULSE_GATE_COMMANDS: JSON.stringify(cmds) } });
const green = () => [cmd("typecheck"), cmd("test")];
const touchApi = (content = "v1\n") => write(repo, "apps/api/src/a.ts", content);

beforeEach(() => {
  repo = makeRepo({ "README.md": "x\n", "apps/api/src/a.ts": "v0\n", "packages/shared/src/b.ts": "v0\n" });
  scratch = tempDir();
  fx = tempDir();
});

test("nothing changed under apps/api or packages/shared: exit 0, nothing run", () => {
  write(repo, "README.md", "changed\n");
  const r = gate(green());
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "");
  assert.deepEqual(ran(), []);
});

test("green: runs typecheck then tests, silent, stores fingerprint in scratchpad", () => {
  touchApi();
  const r = gate(green());
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "");
  assert.deepEqual(ran(), ["typecheck", "test"]);
  assert.ok(readdirSync(scratch).length > 0);
});

test("same fingerprint as last green run: skips; new change: runs again", () => {
  touchApi();
  gate(green());
  const again = gate(green());
  assert.equal(again.code, 0);
  assert.deepEqual(ran(), ["typecheck", "test"]);

  touchApi("v2\n");
  gate(green());
  assert.deepEqual(ran(), ["typecheck", "test", "typecheck", "test"]);
});

test("change under packages/shared also triggers", () => {
  write(repo, "packages/shared/src/b.ts", "v1\n");
  gate(green());
  assert.deepEqual(ran(), ["typecheck", "test"]);
});

test("typecheck red: blocks with last ~40 lines, tests not run, not cached", () => {
  touchApi();
  const out = Array.from({ length: 100 }, (_, i) => `err line ${i + 1}`).join("\n") + "\n";
  const cmds = [cmd("typecheck", { code: 1, out }), cmd("test")];
  const r = gate(cmds);
  assert.equal(r.code, 0);
  assert.equal(r.json.decision, "block");
  assert.match(r.json.reason, /err line 100\b/);
  assert.match(r.json.reason, /err line 61\b/);
  assert.doesNotMatch(r.json.reason, /err line 1\n/);
  assert.doesNotMatch(r.json.reason, /err line 50\b/);
  assert.deepEqual(ran(), ["typecheck"]);

  gate(cmds); // still red => runs again
  assert.deepEqual(ran(), ["typecheck", "typecheck"]);
});

test("tests red: blocks", () => {
  touchApi();
  const r = gate([cmd("typecheck"), cmd("test", { code: 1, out: "FAIL x\n" })]);
  assert.equal(r.json.decision, "block");
  assert.match(r.json.reason, /FAIL x/);
  assert.deepEqual(ran(), ["typecheck", "test"]);
});

test("postgres unreachable: no block, tells you to docker compose up -d; retry skips the green typecheck", () => {
  touchApi();
  const cmds = [cmd("typecheck"), cmd("test", { code: 1, out: "Error: Can't reach database server at `localhost:5435`\n" })];
  const r = gate(cmds);
  assert.equal(r.code, 0);
  assert.equal(r.json.decision, undefined);
  assert.match(r.json.systemMessage, /docker compose up -d/);
  gate(cmds); // tests still re-run (Postgres may be up now), typecheck is not
  assert.deepEqual(ran(), ["typecheck", "test", "test"]);
});

test("tests red then fixed with the same files: resumes at the tests, then caches full green", () => {
  touchApi();
  gate([cmd("typecheck"), cmd("test", { code: 1, out: "FAIL x\n" })]);
  const r = gate(green()); // same fingerprint, test now passes
  assert.equal(r.stdout.trim(), "");
  assert.deepEqual(ran(), ["typecheck", "test", "test"]);
  gate(green());
  assert.deepEqual(ran(), ["typecheck", "test", "test"]);
});

test("stop_hook_active and still red: warns, does not block", () => {
  touchApi();
  const r = gate([cmd("typecheck", { code: 1, out: "boom\n" }), cmd("test")], { stop_hook_active: true });
  assert.equal(r.code, 0);
  assert.equal(r.json.decision, undefined);
  assert.match(r.json.systemMessage, /boom/);
});

test("no scratchpad_dir: still runs, nothing cached", () => {
  touchApi();
  const run = () => runHook("test-gate.mjs", { hook_event_name: "Stop", cwd: repo, stop_hook_active: false }, { env: { DEVPULSE_GATE_COMMANDS: JSON.stringify(green()) } });
  assert.equal(run().code, 0);
  run();
  assert.equal(ran().length, 4);
});
