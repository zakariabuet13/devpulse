import { Router } from "express";
import {
  pullRequestListQuerySchema,
  type PullRequestListQuery,
} from "@devpulse/shared";
import { prisma } from "../db";
import { toPullRequestDto } from "../dto";
import { NotFoundError, parseInput } from "../errors";
import type { Prisma } from "../generated/prisma/client.js";
import { ensureRepository, ensureTeam } from "../lib/guards";
import { page, pageArgs } from "../lib/pagination";

export const pullRequestsRouter = Router();

// Shared by the repository- and team-scoped lists: `scope` picks the PRs, the query adds state/sort/paging.
async function listPullRequests(
  scope: Prisma.PullRequestWhereInput,
  query: PullRequestListQuery,
) {
  const where: Prisma.PullRequestWhereInput = {
    ...scope,
    ...(query.state && { state: { in: query.state } }),
  };
  // `number` is never null; the two timestamp columns are, so keep nulls at the end.
  const primary: Prisma.PullRequestOrderByWithRelationInput =
    query.sort === "number"
      ? { number: query.order }
      : { [query.sort]: { sort: query.order, nulls: "last" } };
  const orderBy = [
    primary,
    { id: "asc" },
  ] satisfies Prisma.PullRequestOrderByWithRelationInput[];

  const [rows, total] = await Promise.all([
    prisma.pullRequest.findMany({ where, orderBy, ...pageArgs(query) }),
    prisma.pullRequest.count({ where }),
  ]);
  return page(rows.map(toPullRequestDto), total, query);
}

pullRequestsRouter.get("/repositories/:id/pull-requests", async (req, res) => {
  const query = parseInput(pullRequestListQuerySchema, req.query);
  await ensureRepository(req.params.id);
  res.json(await listPullRequests({ repositoryId: req.params.id }, query));
});

pullRequestsRouter.get("/teams/:teamId/pull-requests", async (req, res) => {
  const query = parseInput(pullRequestListQuerySchema, req.query);
  await ensureTeam(req.params.teamId);
  res.json(
    await listPullRequests(
      { repository: { teamId: req.params.teamId } },
      query,
    ),
  );
});

pullRequestsRouter.get("/pull-requests/:id", async (req, res) => {
  const pr = await prisma.pullRequest.findUnique({
    where: { id: req.params.id },
  });
  if (!pr) throw new NotFoundError("Pull request not found");
  res.json(toPullRequestDto(pr));
});
