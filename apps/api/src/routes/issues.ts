import { Router } from "express";
import { issueListQuerySchema, updateIssueSchema } from "@devpulse/shared";
import { prisma } from "../db";
import { toIssueDto } from "../dto";
import { NotFoundError, parseInput } from "../errors";
import type { Prisma } from "../generated/prisma/client.js";
import { ensureRepository, rethrowMissing } from "../lib/guards";
import { page, pageArgs } from "../lib/pagination";

export const issuesRouter = Router();

issuesRouter.get("/repositories/:id/issues", async (req, res) => {
  const query = parseInput(issueListQuerySchema, req.query);
  await ensureRepository(req.params.id);

  const where: Prisma.IssueWhereInput = {
    repositoryId: req.params.id,
    ...(query.state && { state: { in: query.state } }),
    ...(query.priority && { priority: { in: query.priority } }),
    ...(query.label && { labels: { has: query.label } }),
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
  res.json(page(rows.map(toIssueDto), total, query));
});

issuesRouter.get("/issues/:id", async (req, res) => {
  const issue = await prisma.issue.findUnique({ where: { id: req.params.id } });
  if (!issue) throw new NotFoundError("Issue not found");
  res.json(toIssueDto(issue));
});

issuesRouter.patch("/issues/:id", async (req, res) => {
  const data = parseInput(updateIssueSchema, req.body);
  try {
    const issue = await prisma.issue.update({ where: { id: req.params.id }, data });
    res.json(toIssueDto(issue));
  } catch (e) {
    rethrowMissing(e, "Issue not found");
  }
});
