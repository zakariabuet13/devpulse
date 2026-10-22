// Stop: typecheck + API tests must be green before a turn that changed apps/api or packages/shared ends.
// Commands come from DEVPULSE_GATE_COMMANDS (JSON array of shell commands) so tests never run the real suite.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { changedFiles, emit, readInput, repoRoot } from "./lib.mjs";

const DEFAULT_COMMANDS = ["npm run typecheck", "npm test -w apps/api"];
const UNREACHABLE = /Can't reach database server|ECONNREFUSED|\bP1001\b/;
const TAIL_LINES = 40;

const sha1 = (data) => createHash("sha1").update(data).digest("hex");

function fingerprint(root, files) {
  const h = createHash("sha1");
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const abs = join(root, f.path);
    h.update(`${f.status}\0${f.path}\0${existsSync(abs) ? sha1(readFileSync(abs)) : "-"}\n`);
  }
  return h.digest("hex");
}

try {
  const { cwd = process.cwd(), stop_hook_active, scratchpad_dir } = await readInput();
  const root = repoRoot(cwd);
  const files = changedFiles(root, ["apps/api", "packages/shared"]);
  if (files.length === 0) process.exit(0);

  const commands = process.env.DEVPULSE_GATE_COMMANDS
    ? JSON.parse(process.env.DEVPULSE_GATE_COMMANDS)
    : DEFAULT_COMMANDS;

  // Cache: { fingerprint, passed } = the first `passed` commands were green for this exact change set.
  // passed === commands.length is a full green run; less means a later step was red or unreachable,
  // so the next Stop resumes there instead of repeating the steps that already passed.
  const print = fingerprint(root, files);
  const cacheFile = scratchpad_dir && join(scratchpad_dir, "devpulse-test-gate.json");
  const save = (passed) => {
    if (!cacheFile) return;
    mkdirSync(scratchpad_dir, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify({ fingerprint: print, passed }), "utf8");
  };
  let passed = 0;
  if (cacheFile && existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(readFileSync(cacheFile, "utf8"));
      if (cached.fingerprint === print) passed = Math.min(cached.passed ?? commands.length, commands.length);
    } catch {
      // corrupt cache: treat as a miss
    }
  }
  if (passed === commands.length) process.exit(0);

  for (const [i, command] of commands.entries()) {
    if (i < passed) continue;
    const r = spawnSync(command, { cwd: root, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.status === 0) continue;

    save(i);
    const output = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const isTestStep = i === commands.length - 1;
    if (isTestStep && UNREACHABLE.test(output)) {
      emit({ systemMessage: "API tests skipped: Postgres is unreachable. Run `docker compose up -d`, then re-run the tests." });
      process.exit(0);
    }

    const tail = output.trimEnd().split(/\r?\n/).slice(-TAIL_LINES).join("\n");
    const message = `\`${command}\` failed:\n${tail}`;
    if (stop_hook_active) emit({ systemMessage: `Still red, not blocking again. ${message}` });
    else emit({ decision: "block", reason: message });
    process.exit(0);
  }

  save(commands.length);
} catch {
  // Not a git repo, or the hook itself broke: don't trap the session.
}
process.exit(0);
