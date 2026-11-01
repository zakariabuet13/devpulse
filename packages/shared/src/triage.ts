import { z } from "zod";
import { prioritySchema } from "./issue";

// Fixed label vocabulary the model may choose from.
export const triageLabelSchema = z.enum([
  "bug",
  "feature",
  "enhancement",
  "authentication",
  "performance",
  "security",
  "refactor",
  "ui",
  "cleanup",
  "infrastructure",
]);

export type TriageLabel = z.infer<typeof triageLabelSchema>;

export const triageResultSchema = z.object({
  priority: prioritySchema,
  labels: z.array(triageLabelSchema).max(3),
  summary: z.string().max(200),
});

export type TriageResult = z.infer<typeof triageResultSchema>;
