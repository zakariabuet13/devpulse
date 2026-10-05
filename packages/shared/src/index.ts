import { z } from "zod";

export const healthSchema = z.object({
  status: z.literal("ok"),
});

export type Health = z.infer<typeof healthSchema>;

export const createTeamSchema = z.object({
  name: z.string().trim().min(1),
});

export type CreateTeam = z.infer<typeof createTeamSchema>;

export const teamSchema = createTeamSchema.extend({
  id: z.string(),
});

export type Team = z.infer<typeof teamSchema>;

export const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export type Priority = z.infer<typeof prioritySchema>;

export const issueStateSchema = z.enum(["OPEN", "CLOSED"]);

export type IssueState = z.infer<typeof issueStateSchema>;

// `state` is the source of truth; `mergedAt` is set only when state = MERGED.
export const prStateSchema = z.enum(["OPEN", "CLOSED", "MERGED"]);

export type PrState = z.infer<typeof prStateSchema>;

export const issueSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  number: z.number().int(),
  title: z.string(),
  state: issueStateSchema,
  labels: z.array(z.string()),
  priority: prioritySchema,
  aiSummary: z.string().nullable(),
  githubCreatedAt: z.iso.datetime(),
});

export type Issue = z.infer<typeof issueSchema>;

export const pullRequestSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  number: z.number().int(),
  title: z.string(),
  state: prStateSchema,
  author: z.string(),
  reviewRequestedAt: z.iso.datetime().nullable(),
  mergedAt: z.iso.datetime().nullable(),
});

export type PullRequest = z.infer<typeof pullRequestSchema>;
