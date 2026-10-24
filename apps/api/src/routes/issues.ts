import { Router } from "express";
import {
  issueListQuerySchema,
  teamIssueListQuerySchema,
  updateIssueSchema,
  type IssueListQuery,
} from "@devpulse/shared";
import { prisma } from "../db";
import { toIssueDto } from "../dto";
import { NotFoundError, parseInput } from "../errors";
import type { Prisma } from "../generated/prisma/client.js";
import { ensureRepository, ensureTeam, rethrowMissing } from "../lib/guards";
import { page, pageArgs } from "../lib/pagination";

export const issuesRouter = Router();

// Under adapter-pg, Prisma's `contains` passes % and _ through as LIKE wildcards; escape them
// (and the backslash escape char) so user input matches literally.
const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

// Filters/sort/paging shared by the repo and team issue lists. `scope` pins the list to a
// repository or team.
async function listIssues(
  scope: Prisma.IssueWhereInput,
  query: IssueListQuery,
  q?: string,
) {
  const where: Prisma.IssueWhereInput = {
    ...scope,
    ...(query.state && { state: { in: query.state } }),
    ...(query.priority && { priority: { in: query.priority } }),
    ...(query.label && { labels: { has: query.label } }),
    ...(q && { title: { contains: escapeLike(q), mode: "insensitive" } }),
  };
  // `sort` is validated against the three column names, so the computed key is safe; TS
  // widens `{ [sort]: order }` to an index signature, hence the cast. `id` is the tiebreaker
  // that keeps offset paging stable.
  const orderBy = [
    { [query.sort]: query.order } as Prisma.IssueOrderByWithRelationInput,
    { id: "asc" },
  ] satisfies Prisma.IssueOrderByWithRelationInput[];

  const [rows, total] = await Promise.all([
    prisma.issue.findMany({ where, orderBy, ...pageArgs(query) }),
    prisma.issue.count({ where }),
  ]);
  return page(rows.map(toIssueDto), total, query);
}

issuesRouter.get("/repositories/:id/issues", async (req, res) => {
  const query = parseInput(issueListQuerySchema, req.query);
  await ensureRepository(req.params.id);
  res.json(await listIssues({ repositoryId: req.params.id }, query));
});

issuesRouter.get("/teams/:teamId/issues", async (req, res) => {
  const { q, ...query } = parseInput(teamIssueListQuerySchema, req.query);
  await ensureTeam(req.params.teamId);
  res.json(
    await listIssues({ repository: { teamId: req.params.teamId } }, query, q),
  );
});

issuesRouter.get("/issues/:id", async (req, res) => {
  const issue = await prisma.issue.findUnique({ where: { id: req.params.id } });
  if (!issue) throw new NotFoundError("Issue not found");
  res.json(toIssueDto(issue));
});

issuesRouter.patch("/issues/:id", async (req, res) => {
  const data = parseInput(updateIssueSchema, req.body);
  try {
    const issue = await prisma.issue.update({
      where: { id: req.params.id },
      data,
    });
    res.json(toIssueDto(issue));
  } catch (e) {
    rethrowMissing(e, "Issue not found");
  }
});
