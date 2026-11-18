import "dotenv/config"; // loads apps/agents/.env: the SDK won't
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { parseArgs } from "./args";
import { OUT_DIR } from "./config";
import { listCommits, verifyRef } from "./git";
import { buildOptions } from "./options";
import { buildPrompt } from "./prompt";
import { render } from "./render";
import { releaseNotesSchema } from "./schema";
import { summarize } from "./summarize";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const runsDir = fileURLToPath(new URL("../../runs/", import.meta.url));

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  // $0 checks first: no SDK call on bad input
  await verifyRef(args.from);
  await verifyRef(args.to);
  const commits = await listCommits(args.from, args.to);
  if (commits.length === 0) {
    console.error(`no commits in ${args.from}..${args.to}`);
    return 1;
  }

  const abortController = new AbortController();
  process.on("SIGINT", () => abortController.abort());
  if (args.abortAfter) {
    setTimeout(() => abortController.abort(), args.abortAfter * 1000).unref();
  }

  mkdirSync(runsDir, { recursive: true });
  const log = join(runsDir, `release-notes-${Date.now()}.jsonl`);
  const messages: unknown[] = [];
  let exitCode = 1;

  try {
    for await (const m of query({
      prompt: buildPrompt(args.version, commits),
      options: buildOptions(args, { repoRoot, abortController }),
    })) {
      messages.push(m);
      appendFileSync(log, JSON.stringify(m) + "\n");
      if (m.type === "result" && m.subtype === "success" && !m.is_error) {
        const parsed = releaseNotesSchema.safeParse(m.structured_output);
        if (parsed.success) {
          const dir = join(repoRoot, OUT_DIR);
          mkdirSync(dir, { recursive: true });
          const file = join(dir, `${args.version}.md`);
          writeFileSync(file, render(args.version, parsed.data), "utf8");
          console.log(`wrote ${file}`);
          exitCode = 0;
        } else {
          console.error("structured output failed validation");
        }
      }
    }
  } catch (err) {
    console.error("query ended with an error:", (err as Error).message);
    exitCode = 1;
  }

  console.log(summarize(messages));
  return exitCode;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  });
