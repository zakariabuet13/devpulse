import { z } from "zod";
import {
  csvOf,
  paginated,
  paginationQuerySchema,
  sortOrderSchema,
} from "./common";

// `state` is the source of truth; `mergedAt` is set only when state = MERGED.
export const prStateSchema = z.enum(["OPEN", "CLOSED", "MERGED"]);

export type PrState = z.infer<typeof prStateSchema>;

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

export const pullRequestSortSchema = z.enum([
  "number",
  "reviewRequestedAt",
  "mergedAt",
]);

export const pullRequestListQuerySchema = paginationQuerySchema.extend({
  state: csvOf(prStateSchema).optional(),
  sort: pullRequestSortSchema.default("number"),
  order: sortOrderSchema.default("desc"),
});

export type PullRequestListQuery = z.infer<typeof pullRequestListQuerySchema>;

export const pullRequestPageSchema = paginated(pullRequestSchema);
