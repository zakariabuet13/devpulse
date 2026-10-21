import { z } from "zod";
import { atLeastOneKey, atLeastOneKeyMessage, paginated } from "./common";
import { prioritySchema } from "./issue";

const teamName = z.string().trim().min(1).max(100);

export const createTeamSchema = z.object({
  name: teamName,
});

export type CreateTeam = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z
  .object({ name: teamName.optional() })
  .strict()
  .refine(atLeastOneKey, atLeastOneKeyMessage);

export type UpdateTeam = z.infer<typeof updateTeamSchema>;

export const teamSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.iso.datetime(),
});

export type Team = z.infer<typeof teamSchema>;

export const teamPageSchema = paginated(teamSchema);

// Every priority key is always present (0 when none match).
// `z.record(enum, ...)` is exhaustive in zod 4: all enum keys are required.
export const teamStatsSchema = z.object({
  openIssuesByPriority: z.record(prioritySchema, z.number().int()),
  openPullRequests: z.number().int(),
  mergedLast7Days: z.number().int(),
});

export type TeamStats = z.infer<typeof teamStatsSchema>;
