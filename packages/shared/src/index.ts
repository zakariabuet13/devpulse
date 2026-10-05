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

export const issueSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  number: z.number().int(),
  title: z.string(),
  state: z.string(),
  labels: z.array(z.string()),
  priority: prioritySchema,
  aiSummary: z.string().nullable(),
  githubCreatedAt: z.string().datetime(),
});

export type Issue = z.infer<typeof issueSchema>;

export const pullRequestSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  number: z.number().int(),
  title: z.string(),
  state: z.string(),
  author: z.string(),
  reviewRequestedAt: z.string().datetime().nullable(),
  mergedAt: z.string().datetime().nullable(),
});

export type PullRequest = z.infer<typeof pullRequestSchema>;
