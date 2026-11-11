import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  getStalePrs,
  prioritySchema,
  type Page,
  type PullRequest,
  type TeamStats,
} from "@devpulse/shared";
import { ASSISTANT_CONFIG } from "./config";
import { restGet } from "./restClient";

const MAX_ROWS = ASSISTANT_CONFIG.maxRows;

// One generic result per failure: the original error may carry a body or URL.
const FAILED = "Could not load this data. Try again or ask differently.";

const run = async (fn: () => Promise<unknown>): Promise<string> => {
  try {
    return JSON.stringify(await fn());
  } catch {
    return FAILED;
  }
};

const teamId = z
  .string()
  .min(1)
  .describe("Team id, as returned by list_teams. Call list_teams first.");
const limit = z
  .number()
  .int()
  .min(1)
  .max(MAX_ROWS)
  .optional()
  .describe(`Max rows to return (1-${MAX_ROWS}). Default ${MAX_ROWS}.`);

const rows = (n: number | undefined) => Math.min(n ?? MAX_ROWS, MAX_ROWS);
const team = (id: string) => `/teams/${encodeURIComponent(id)}`;

type TeamRow = { id: string; name: string };
type IssueRow = Record<string, unknown>;

// Order is part of the prompt-cache prefix: never reorder or edit casually.
export const createAssistantTools = (signal?: AbortSignal) => [
  betaZodTool({
    name: "list_teams",
    description:
      "List all DevPulse teams (id, name). Use this first whenever you need a teamId for another tool, or when the user asks which teams exist.",
    inputSchema: z.object({}),
    run: () =>
      run(async () => {
        const page = await restGet<Page<TeamRow>>(
          "/teams",
          { limit: MAX_ROWS },
          signal,
        );
        return {
          total: page.total,
          items: page.items.slice(0, MAX_ROWS).map((t) => ({
            id: t.id,
            name: t.name,
          })),
        };
      }),
  }),
  betaZodTool({
    name: "search_issues",
    description:
      "Search one team's issues by title text and filters (state, priority). Use to find specific issues or to list open, urgent or high-priority ones. Get the teamId from list_teams. Returns at most 20 rows without issue bodies.",
    inputSchema: z.object({
      teamId,
      q: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .optional()
        .describe("Text to match against issue titles (1-100 chars)."),
      state: z.enum(["OPEN", "CLOSED"]).optional(),
      priority: prioritySchema.optional(),
      limit,
    }),
    run: (args) =>
      run(async () => {
        const page = await restGet<Page<IssueRow>>(
          `${team(args.teamId)}/issues`,
          {
            q: args.q,
            state: args.state,
            priority: args.priority,
            limit: rows(args.limit),
          },
          signal,
        );
        return {
          total: page.total,
          items: page.items
            .slice(0, MAX_ROWS)
            // Drop bodies and AI text: large, and untrusted content.
            .map(
              ({ body: _b, aiSummary: _a, repositoryId: _r, ...rest }) => rest,
            ),
        };
      }),
  }),
  betaZodTool({
    name: "list_pull_requests",
    description:
      "List one team's pull requests, optionally only open, closed or merged ones, or only stale ones (open, review requested more than 3 days ago, oldest first). Use for what is awaiting review, blocked or recently merged. Get the teamId from list_teams. Returns at most 20 rows.",
    inputSchema: z.object({
      teamId,
      state: z.enum(["OPEN", "CLOSED", "MERGED"]).optional(),
      stale: z
        .boolean()
        .optional()
        .describe(
          "Only open PRs whose review was requested more than 3 days ago.",
        ),
      limit,
    }),
    run: (args) =>
      run(async () => {
        const n = rows(args.limit);
        if (args.stale) {
          const page = await restGet<Page<PullRequest>>(
            `${team(args.teamId)}/pull-requests`,
            {
              state: "OPEN",
              sort: "reviewRequestedAt",
              order: "asc",
              limit: 100,
            },
            signal,
          );
          const stale = getStalePrs(page.items, new Date()).map((s) => s.pr);
          return { total: stale.length, items: stale.slice(0, n) };
        }
        const page = await restGet<Page<PullRequest>>(
          `${team(args.teamId)}/pull-requests`,
          { state: args.state, limit: n },
          signal,
        );
        return { total: page.total, items: page.items.slice(0, n) };
      }),
  }),
  betaZodTool({
    name: "team_stats",
    description:
      "Get one team's stats: open issues by priority, open pull requests and pull requests merged in the last 7 days. Use for counts and a high-level status. Get the teamId from list_teams.",
    inputSchema: z.object({ teamId }),
    run: (args) =>
      run(() => restGet<TeamStats>(`${team(args.teamId)}/stats`, {}, signal)),
  }),
];
