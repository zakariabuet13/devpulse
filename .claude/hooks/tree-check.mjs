// Stop: block while a changed file starts with a UTF-8 BOM or a tracked migration is modified.
import { closeSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS, changedFiles, emit, readInput, repoRoot } from "./lib.mjs";

function hasBom(file) {
  let fd;
  try {
    fd = openSync(file, "r");
    const buf = Buffer.alloc(3);
    return readSync(fd, buf, 0, 3, 0) === 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  } catch {
    return false; // deleted, directory, unreadable
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

const list = (files) => files.map((f) => `  - ${f}`).join("\n");

try {
  const { cwd = process.cwd(), stop_hook_active } = await readInput();
  const root = repoRoot(cwd);
  const changed = changedFiles(root);

  const bom = changed.filter((f) => !f.status.includes("D") && hasBom(join(root, f.path))).map((f) => f.path);
  const migrations = changed.filter((f) => f.status !== "??" && MIGRATIONS.test(f.path)).map((f) => f.path);

  const problems = [];
  if (bom.length) problems.push(`Files start with a UTF-8 BOM (rewrite them as UTF-8 without BOM):\n${list(bom)}`);
  if (migrations.length) {
    problems.push(
      `Committed migrations were modified (revert them, put the change in a new migration):\n${list(migrations)}`,
    );
  }

  if (problems.length) {
    const message = problems.join("\n\n");
    if (stop_hook_active) emit({ systemMessage: `Still unresolved:\n${message}` });
    else emit({ decision: "block", reason: message });
  }
} catch {
  // Not a git repo or git unavailable: nothing to check.
}
process.exit(0);
