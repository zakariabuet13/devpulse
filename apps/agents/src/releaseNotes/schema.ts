import { z } from "zod";

// pr is optional: some commits (merges, direct pushes) have no PR number
const item = z.object({
  text: z.string(),
  pr: z.number().int().positive().optional(),
});

export const releaseNotesSchema = z.object({
  features: z.array(item),
  fixes: z.array(item),
  internal: z.array(item),
});

export type ReleaseNotes = z.infer<typeof releaseNotesSchema>;

// draft-7: the SDK rejects the newer drafts zod 4 emits by default
export const releaseNotesJsonSchema = z.toJSONSchema(releaseNotesSchema, {
  target: "draft-7",
}) as Record<string, unknown>;
