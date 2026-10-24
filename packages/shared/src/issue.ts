import { z } from "zod";
import {
  csvOf,
  paginated,
  paginationQuerySchema,
  sortOrderSchema,
} from "./common";

export const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export type Priority = z.infer<typeof prioritySchema>;

export const issueStateSchema = z.enum(["OPEN", "CLOSED"]);

export type IssueState = z.infer<typeof issueStateSchema>;

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

// `priority` is the only issue field writable via the API.
export const updateIssueSchema = z
  .object({ priority: prioritySchema })
  .strict();

export type UpdateIssue = z.infer<typeof updateIssueSchema>;

export const issueSortSchema = z.enum([
  "githubCreatedAt",
  "number",
  "priority",
]);

export const issueListQuerySchema = paginationQuerySchema.extend({
  state: csvOf(issueStateSchema).optional(),
  priority: csvOf(prioritySchema).optional(),
  label: z.string().optional(),
  sort: issueSortSchema.default("githubCreatedAt"),
  order: sortOrderSchema.default("desc"),
});

export type IssueListQuery = z.infer<typeof issueListQuerySchema>;

// Team-wide list adds a title search; trim runs before min/max, so "   " is rejected.
export const teamIssueListQuerySchema = issueListQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
});

export type TeamIssueListQuery = z.infer<typeof teamIssueListQuerySchema>;

export const issuePageSchema = paginated(issueSchema);
