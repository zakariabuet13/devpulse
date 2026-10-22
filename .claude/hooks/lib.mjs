// Helpers shared by the hook scripts.
import { spawnSync } from "node:child_process";

export async function readInput() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  return JSON.parse(raw);
}

export function git(cwd, args) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

export function repoRoot(cwd) {
  const r = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (r.status !== 0) throw new Error(`not a git repo: ${cwd}`);
  return r.stdout.trim();
}

/** `git status --porcelain` as [{ status, path }]; paths are repo-root relative, renames report the new path. */
export function changedFiles(root, pathspecs = []) {
  const r = git(root, ["status", "--porcelain", "-z", "--untracked-files=all", "--", ...pathspecs]);
  if (r.status !== 0) throw new Error(`git status failed: ${r.stderr}`);
  const parts = r.stdout.split("\0").filter(Boolean);
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const status = parts[i].slice(0, 2);
    files.push({ status, path: parts[i].slice(3) });
    if (/[RC]/.test(status)) i++; // next entry is the original path
  }
  return files;
}

export const MIGRATIONS = /(^|\/)apps\/api\/prisma\/migrations\//i;

export const toSlashes = (p) => p.replaceAll("\\", "/");

export const emit = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
