// Shared test helpers: spawn a hook with a JSON fixture on stdin, build temp git repos.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hooksDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Runs `.claude/hooks/<script>` with `input` as stdin JSON (or a raw string). */
export function runHook(script, input, { env = {}, cwd } = {}) {
  const r = spawnSync(process.execPath, [join(hooksDir, script)], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    cwd,
    env: { ...process.env, ...env },
  });
  let json;
  try {
    json = r.stdout.trim() ? JSON.parse(r.stdout) : undefined;
  } catch {
    json = undefined;
  }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

export function tempDir() {
  return realpathSync.native(mkdtempSync(join(tmpdir(), "devpulse-hook-")));
}

export function write(root, rel, content) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

export function git(root, ...args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

/** Temp git repo with one commit of `files` ({ relPath: content }). */
export function makeRepo(files = { "README.md": "# t\n" }) {
  const root = tempDir();
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "config", "core.autocrlf", "false");
  for (const [rel, content] of Object.entries(files)) write(root, rel, content);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  return root;
}

export const BOM = "﻿";
