import {
  issueSchema,
  pullRequestSchema,
  type Issue,
  type PullRequest,
} from "@devpulse/shared";
import type {
  Issue as IssueRow,
  PullRequest as PullRequestRow,
} from "./generated/prisma/client.js";

// Prisma returns Date objects; the shared schemas expect ISO strings on the wire.

export function toIssueDto(row: IssueRow): Issue {
  return issueSchema.parse({
    ...row,
    githubCreatedAt: row.githubCreatedAt.toISOString(),
  });
}

export function toPullRequestDto(row: PullRequestRow): PullRequest {
  return pullRequestSchema.parse({
    ...row,
    reviewRequestedAt: row.reviewRequestedAt?.toISOString() ?? null,
    mergedAt: row.mergedAt?.toISOString() ?? null,
  });
}
