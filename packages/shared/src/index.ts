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
