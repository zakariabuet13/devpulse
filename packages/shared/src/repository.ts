import { z } from "zod";
import { atLeastOneKey, atLeastOneKeyMessage, paginated } from "./common";

// "owner/repo": owner is a GitHub login-ish name (max 39), repo allows dots/underscores.
const githubFullName = z
  .string()
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/);

export const repositorySchema = z.object({
  id: z.string(),
  teamId: z.string(),
  githubFullName: z.string(),
});

export type Repository = z.infer<typeof repositorySchema>;

export const createRepositorySchema = z.object({
  githubFullName,
});

export type CreateRepository = z.infer<typeof createRepositorySchema>;

export const updateRepositorySchema = z
  .object({
    githubFullName: githubFullName.optional(),
    teamId: z.string().min(1).optional(),
  })
  .strict()
  .refine(atLeastOneKey, atLeastOneKeyMessage);

export type UpdateRepository = z.infer<typeof updateRepositorySchema>;

export const repositoryPageSchema = paginated(repositorySchema);
