import type { SyncResult } from "@devpulse/shared";
import { prisma } from "../db";
import { AppError, ConflictError } from "../errors";
import {
  GitHubNotConfiguredError,
  GitHubNotFoundError,
  type GitHubClient,
} from "../github/types";
import { ensureTeam } from "../lib/guards";
import { logger } from "../logger";

const SYNC_FAILED = "Sync failed for this repository";
// Upserts are sequential, so a big repo can outlast Prisma's 5s default.
const TX_TIMEOUT_MS = 60_000;

// In-process only: enough for a single API instance, not for several.
const syncing = new Set<string>();

export async function syncTeam(
  teamId: string,
  github: GitHubClient,
): Promise<SyncResult> {
  await ensureTeam(teamId);
  if (syncing.has(teamId)) throw new ConflictError("Sync already in progress");
  syncing.add(teamId);
  try {
    return await runSync(teamId, github);
  } finally {
    syncing.delete(teamId);
  }
}

async function runSync(
  teamId: string,
  github: GitHubClient,
): Promise<SyncResult> {
  const repos = await prisma.repository.findMany({
    where: { teamId },
    orderBy: [{ githubFullName: "asc" }, { id: "asc" }],
  });

  const result: SyncResult = { repositories: [], skipped: [], errors: [] };
  // Sequential on purpose: keeps GitHub rate-limit use and DB load predictable.
  for (const repo of repos) {
    const ref = { repositoryId: repo.id, githubFullName: repo.githubFullName };
    try {
      result.repositories.push(await syncRepository(repo, github));
    } catch (e) {
      // Every repo would fail the same way: abort instead of reporting N errors.
      if (e instanceof GitHubNotConfiguredError)
        throw new AppError(503, "INTERNAL", "GitHub sync is not configured");
      if (e instanceof GitHubNotFoundError) {
        result.skipped.push({ ...ref, reason: "NOT_FOUND" });
      } else {
        // Name only: upstream messages could echo sensitive text.
        logger.error(
          {
            repositoryId: repo.id,
            errName: e instanceof Error ? e.name : typeof e,
          },
          "repository sync failed",
        );
        result.errors.push({ ...ref, message: SYNC_FAILED });
      }
    }
  }
  return result;
}

async function syncRepository(
  repo: { id: string; githubFullName: string; githubId: bigint | null },
  github: GitHubClient,
): Promise<SyncResult["repositories"][number]> {
  const gh =
    repo.githubId === null
      ? await github.getRepo(repo.githubFullName)
      : await github.getRepoById(repo.githubId);

  const renamed =
    gh.fullName.toLowerCase() !== repo.githubFullName.toLowerCase();
  if (repo.githubId === null || renamed) {
    await prisma.repository.update({
      where: { id: repo.id },
      data: {
        githubId: gh.id,
        ...(renamed ? { githubFullName: gh.fullName } : {}),
      },
    });
  }
  const fullName = renamed ? gh.fullName : repo.githubFullName;

  // Fetch everything before touching the DB so a failure never deletes data.
  const [ghIssues, ghPulls] = await Promise.all([
    github.listIssues(fullName),
    github.listPulls(fullName),
  ]);
  const issues = ghIssues.filter((i) => !i.isPullRequest);

  const counts = await prisma.$transaction(
    async (tx) => {
      const repositoryId = repo.id;
      const [haveIssues, havePulls] = await Promise.all([
        tx.issue.findMany({
          where: { repositoryId },
          select: { number: true },
        }),
        tx.pullRequest.findMany({
          where: { repositoryId },
          select: { number: true },
        }),
      ]);
      const issueNumbers = new Set(haveIssues.map((i) => i.number));
      const pullNumbers = new Set(havePulls.map((p) => p.number));

      // `update` payloads omit local-only fields (priority, aiSummary, reviewRequestedAt).
      for (const i of issues) {
        const fields = {
          title: i.title,
          state: i.state === "open" ? ("OPEN" as const) : ("CLOSED" as const),
          labels: i.labels,
          githubCreatedAt: i.createdAt,
        };
        await tx.issue.upsert({
          where: { repositoryId_number: { repositoryId, number: i.number } },
          create: { repositoryId, number: i.number, ...fields },
          update: fields,
        });
      }
      for (const p of ghPulls) {
        const state = p.mergedAt
          ? ("MERGED" as const)
          : p.state === "open"
            ? ("OPEN" as const)
            : ("CLOSED" as const);
        const fields = {
          title: p.title,
          state,
          author: p.author,
          mergedAt: state === "MERGED" ? p.mergedAt : null,
        };
        await tx.pullRequest.upsert({
          where: { repositoryId_number: { repositoryId, number: p.number } },
          create: { repositoryId, number: p.number, ...fields },
          update: fields,
        });
      }

      const fetched = new Set(issues.map((i) => i.number));
      const { count: deleted } = await tx.issue.deleteMany({
        where: { repositoryId, number: { notIn: [...fetched] } },
      });

      return {
        issues: {
          created: issues.filter((i) => !issueNumbers.has(i.number)).length,
          updated: issues.filter((i) => issueNumbers.has(i.number)).length,
          deleted,
        },
        pullRequests: {
          created: ghPulls.filter((p) => !pullNumbers.has(p.number)).length,
          updated: ghPulls.filter((p) => pullNumbers.has(p.number)).length,
        },
      };
    },
    { timeout: TX_TIMEOUT_MS },
  );

  return {
    repositoryId: repo.id,
    githubFullName: fullName,
    githubId: gh.id.toString(),
    ...counts,
  };
}
