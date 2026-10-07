import {
  issueSchema,
  memberSchema,
  pullRequestSchema,
  repositorySchema,
  teamSchema,
  type Issue,
  type Member,
  type PullRequest,
  type Repository,
  type Team,
} from "@devpulse/shared";
import type {
  Issue as IssueRow,
  Member as MemberRow,
  PullRequest as PullRequestRow,
  Repository as RepositoryRow,
  Team as TeamRow,
} from "./generated/prisma/client.js";

// Prisma returns Date objects; the shared schemas expect ISO strings on the wire.

export function toTeamDto(row: TeamRow): Team {
  return teamSchema.parse({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  });
}

export function toMemberDto(row: MemberRow): Member {
  return memberSchema.parse({
    id: row.id,
    teamId: row.teamId,
    name: row.name,
    githubLogin: row.githubLogin,
  });
}

export function toRepositoryDto(row: RepositoryRow): Repository {
  return repositorySchema.parse({
    id: row.id,
    teamId: row.teamId,
    githubFullName: row.githubFullName,
  });
}

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
