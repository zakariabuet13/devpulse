// PostToolUse (Edit|Write): format the edited file with Prettier. Never fails: exits 0 on any problem.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readInput } from "./lib.mjs";

try {
  const { tool_input, cwd = process.cwd() } = await readInput();
  const file = tool_input?.file_path;
  if (file) {
    const prettier = await import("prettier");
    const path = resolve(cwd, file);
    const info = await prettier.getFileInfo(path, {
      ignorePath: join(cwd, ".prettierignore"),
      resolveConfig: true,
    });
    if (!info.ignored && info.inferredParser) {
      const config = (await prettier.resolveConfig(path)) ?? {};
      const source = readFileSync(path, "utf8");
      const formatted = await prettier.format(source, { ...config, filepath: path });
      if (formatted !== source) writeFileSync(path, formatted, "utf8");
    }
  }
} catch {
  // Claude may be mid multi-step edit (syntax errors, missing file): stay quiet.
}
process.exit(0);
