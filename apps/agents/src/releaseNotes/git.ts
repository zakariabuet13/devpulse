import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type Exec = (
  file: string,
  args: string[],
) => Promise<{ stdout: string; stderr?: string }>;

export const defaultExec: Exec = promisify(execFile) as unknown as Exec;

export type Commit = { sha: string; subject: string; pr?: number };

export async function verifyRef(ref: string, exec: Exec = defaultExec) {
  await exec("git", [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${ref}^{commit}`,
  ]);
}

export async function listCommits(
  from: string,
  to: string,
  exec: Exec = defaultExec,
): Promise<Commit[]> {
  const { stdout } = await exec("git", [
    "log",
    "--format=%H%x09%s",
    `${from}..${to}`,
  ]);
  const commits: Commit[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const sha = line.slice(0, tab);
    const subject = line.slice(tab + 1);
    const m = /\(#(\d+)\)$/.exec(subject);
    commits.push({ sha, subject, pr: m ? Number(m[1]) : undefined });
  }
  return commits;
}
