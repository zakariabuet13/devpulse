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

  const print = fingerprint(root, files);
  const cacheFile = scratchpad_dir && join(scratchpad_dir, "devpulse-test-gate.json");
  if (cacheFile && existsSync(cacheFile)) {
    try {
      if (JSON.parse(readFileSync(cacheFile, "utf8")).fingerprint === print) process.exit(0);
    } catch {
      // corrupt cache: treat as a miss
    }
  }

  const commands = process.env.DEVPULSE_GATE_COMMANDS
    ? JSON.parse(process.env.DEVPULSE_GATE_COMMANDS)
    : DEFAULT_COMMANDS;

  for (const [i, command] of commands.entries()) {
    const r = spawnSync(command, { cwd: root, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.status === 0) continue;

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

  if (cacheFile) {
    mkdirSync(scratchpad_dir, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify({ fingerprint: print }), "utf8");
  }
} catch {
  // Not a git repo, or the hook itself broke: don't trap the session.
}
process.exit(0);
