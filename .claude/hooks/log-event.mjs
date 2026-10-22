// Debug logger: appends every event it receives to %TEMP%\devpulse-hook-events.log
import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let raw = "";

for await (const chunk of process.stdin) raw += chunk;

const {
  session_id,
  transcript_path,
  cwd,
  prompt_id,
  scratchpad_dir,
  effort,
  ...rest
} = JSON.parse(raw);

const short = (k, v) =>
  typeof v === "string" && v.length > 70 ? v.slice(0, 70) + "…" : v;

appendFileSync(
  join(tmpdir(), "devpulse-hook-events.log"),
  `${new Date().toISOString()} ${JSON.stringify(rest, short)}\n`,
);
