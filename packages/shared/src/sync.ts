import { z } from "zod";

const issueCountsSchema = z.object({
  created: z.number().int(),
  updated: z.number().int(),
  deleted: z.number().int(),
});

const prCountsSchema = z.object({
  created: z.number().int(),
  updated: z.number().int(),
});

const repoRef = {
  repositoryId: z.string(),
  githubFullName: z.string(),
};

export const syncResultSchema = z.object({
  repositories: z.array(
    z.object({
      ...repoRef,
      // GitHub ids exceed int32; sent as a decimal string (JSON can't carry bigint).
      githubId: z.string(),
      issues: issueCountsSchema,
      pullRequests: prCountsSchema,
    }),
  ),
  skipped: z.array(z.object({ ...repoRef, reason: z.literal("NOT_FOUND") })),
  errors: z.array(z.object({ ...repoRef, message: z.string() })),
});

export type SyncResult = z.infer<typeof syncResultSchema>;
