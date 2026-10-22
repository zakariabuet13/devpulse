import { prisma } from "../src/db";
import type { Prisma } from "../src/generated/prisma/client.js";

// Unique suffix for values with unique constraints (githubLogin, githubFullName, ...).
let seq = 0;
const next = () => ++seq;

// "Unchecked" inputs take plain FK ids (teamId) instead of nested `connect`.
// Parents are auto-created when the FK isn't supplied.

export async function createTeam(
  overrides: Partial<Prisma.TeamUncheckedCreateInput> = {},
) {
  const n = next();
  return prisma.team.create({ data: { name: `Team ${n}`, ...overrides } });
}

export async function createMember(
  overrides: Partial<Prisma.MemberUncheckedCreateInput> = {},
) {
  const n = next();
  return prisma.member.create({
    data: {
      name: `Member ${n}`,
      githubLogin: `member-${n}`,
      ...overrides,
      teamId: overrides.teamId ?? (await createTeam()).id,
    },
  });
}

export async function createRepository(
  overrides: Partial<Prisma.RepositoryUncheckedCreateInput> = {},
) {
  const n = next();
  return prisma.repository.create({
    data: {
      githubFullName: `org/repo-${n}`,
      ...overrides,
      teamId: overrides.teamId ?? (await createTeam()).id,
    },
  });
}

export async function createPullRequest(
  overrides: Partial<Prisma.PullRequestUncheckedCreateInput> = {},
) {
  const n = next();
  return prisma.pullRequest.create({
    data: {
      number: n,
      title: `PR ${n}`,
      state: "OPEN",
      author: "author",
      ...overrides,
      repositoryId: overrides.repositoryId ?? (await createRepository()).id,
    },
  });
}

export async function createIssue(
  overrides: Partial<Prisma.IssueUncheckedCreateInput> = {},
) {
  const n = next();
  return prisma.issue.create({
    data: {
      number: n,
      title: `Issue ${n}`,
      state: "OPEN",
      labels: [],
      githubCreatedAt: new Date(),
      ...overrides,
      repositoryId: overrides.repositoryId ?? (await createRepository()).id,
    },
  });
}
