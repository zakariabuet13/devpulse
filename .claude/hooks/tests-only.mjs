// PreToolUse (Edit|Write): an agent may write only under apps/api/test/, apps/mcp/test/, or its own memory folder. Fails closed.
import { existsSync, realpathSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { readInput, repoRoot, toSlashes } from "./lib.mjs";

// Relative to the repo root. `memory: project` on test-writer stores notes in the second one.
const ALLOWED_DIRS = [
  "apps/api/test",
  "apps/mcp/test",
  ".claude/agent-memory/test-writer",
];

// Exit 2 + stderr is the whole contract: Claude Code ignores stdout JSON on exit 2.
function deny(reason) {
  process.stderr.write(reason + "\n");
  process.exit(2);
}

// realpath of the deepest existing ancestor + the not-yet-created rest, so a symlinked dir can't leak out.
function realResolve(abs) {
  const rest = [];
  let dir = abs;
  while (!existsSync(dir)) {
    rest.unshift(basename(dir));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(realpathSync.native(dir), ...rest);
}

// Windows paths are case-insensitive, so `Apps/API/Test` is the same folder there.
const norm = (p) => (process.platform === "win32" ? p.toLowerCase() : p);

function isInside(dir, abs) {
  const rel = relative(norm(dir), norm(abs));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

try {
  const { tool_input = {}, cwd = process.cwd() } = await readInput();
  const raw = tool_input.file_path;
  if (typeof raw !== "string" || raw.trim() === "")
    deny("tests-only: no file_path, blocking.");

  const root = realpathSync.native(repoRoot(cwd));
  const abs = realResolve(resolve(cwd, toSlashes(raw))); // collapses `..` before the check
  if (!ALLOWED_DIRS.some((d) => isInside(resolve(root, d), abs))) {
    deny(
      `${toSlashes(raw)} is outside what this agent may write. ` +
        `Only apps/api/test/, apps/mcp/test/, and .claude/agent-memory/test-writer/ are allowed; ` +
        `source, shared, prisma and config changes belong to the implementer.`,
    );
  }
} catch (err) {
  deny(`tests-only hook failed, blocking to be safe: ${err.message}`);
}
