import { Router } from "express";
import {
  createRepositorySchema,
  paginationQuerySchema,
  updateRepositorySchema,
} from "@devpulse/shared";
import { prisma } from "../db";
import { toRepositoryDto } from "../dto";
import { NotFoundError, parseInput } from "../errors";
import { ensureTeam, rethrowMissing } from "../lib/guards";
import { page, pageArgs } from "../lib/pagination";

export const repositoriesRouter = Router();

repositoriesRouter.get("/teams/:teamId/repositories", async (req, res) => {
  const query = parseInput(paginationQuerySchema, req.query);
  const where = { teamId: req.params.teamId };
  await ensureTeam(req.params.teamId);
  const [rows, total] = await Promise.all([
    prisma.repository.findMany({
      where,
      orderBy: [{ githubFullName: "asc" }, { id: "asc" }],
      ...pageArgs(query),
    }),
    prisma.repository.count({ where }),
  ]);
  res.json(page(rows.map(toRepositoryDto), total, query));
});

repositoriesRouter.post("/teams/:teamId/repositories", async (req, res) => {
  const data = parseInput(createRepositorySchema, req.body);
  await ensureTeam(req.params.teamId);
  const repo = await prisma.repository.create({
    data: { ...data, teamId: req.params.teamId },
  });
  res.status(201).json(toRepositoryDto(repo));
});

repositoriesRouter.get("/repositories/:id", async (req, res) => {
  const repo = await prisma.repository.findUnique({
    where: { id: req.params.id },
  });
  if (!repo) throw new NotFoundError("Repository not found");
  res.json(toRepositoryDto(repo));
});

repositoriesRouter.patch("/repositories/:id", async (req, res) => {
  const data = parseInput(updateRepositorySchema, req.body);
  const id = req.params.id;
  const existing = await prisma.repository.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Repository not found");
  if (data.teamId) await ensureTeam(data.teamId);
  try {
    // Issues/PRs follow the repository via their repositoryId FK; nothing else to update.
    const repo = await prisma.repository.update({ where: { id }, data });
    res.json(toRepositoryDto(repo));
  } catch (e) {
    rethrowMissing(e, "Repository not found");
  }
});

repositoriesRouter.delete("/repositories/:id", async (req, res) => {
  try {
    // Cascades to the repository's issues and pull requests.
    await prisma.repository.delete({ where: { id: req.params.id } });
  } catch (e) {
    rethrowMissing(e, "Repository not found");
  }
  res.status(204).end();
});
