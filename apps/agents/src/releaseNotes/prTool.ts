import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

export type RunGh = (args: string[]) => Promise<string>;

const execFileP = promisify(execFile);

export const defaultRunGh: RunGh = async (args) =>
  (await execFileP("gh", args)).stdout;

const BODY_MAX = 1500;

export function createPrTool(runGh: RunGh = defaultRunGh) {
  return tool(
    "get_pull_request",
    "Get a pull request's title, labels and (trimmed) body by number.",
    { number: z.number().int().positive() },
    async ({ number }) => {
      const fail = {
        isError: true,
        content: [{ type: "text" as const, text: `PR #${number} not found` }],
      };
      try {
        const out = await runGh([
          "pr",
          "view",
          String(number),
          "--json",
          "number,title,body,labels",
        ]);
        const pr = JSON.parse(out) as {
          title?: string;
          body?: string | null;
          labels?: { name: string }[];
        };
        const body = (pr.body ?? "").slice(0, BODY_MAX);
        const labels = (pr.labels ?? []).map((l) => l.name).join(", ");
        return {
          content: [
            {
              type: "text" as const,
              text: `PR #${number}: ${pr.title ?? ""}\nLabels: ${labels}\n\n${body}`,
            },
          ],
        };
      } catch {
        return fail; // never leak stderr
      }
    },
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );
}

export function createNotesServer(runGh: RunGh = defaultRunGh) {
  const server = createSdkMcpServer({
    name: "notes",
    version: "1.0.0",
    tools: [createPrTool(runGh)],
  });
  // The live McpServer instance is circular: keep the options JSON-safe (logging, tests).
  Object.defineProperty(server, "toJSON", {
    value: () => ({ type: server.type, name: server.name }),
    enumerable: false,
  });
  return server;
}
