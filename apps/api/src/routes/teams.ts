import { Router } from "express";
import {
  createTeamSchema,
  paginationQuerySchema,
  updateTeamSchema,
} from "@devpulse/shared";
import { prisma } from "../db";
import { toTeamDto } from "../dto";
import { ConflictError, NotFoundError, parseInput } from "../errors";
import { page, pageArgs } from "../lib/pagination";
import { Prisma } from "../generated/prisma/client.js";

export const teamsRouter = Router();

teamsRouter.get("/teams", async (req, res) => {
  const query = parseInput(paginationQuerySchema, req.query);
  const [rows, total] = await Promise.all([
    prisma.team.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...pageArgs(query),
    }),
    prisma.team.count(),
  ]);
  res.json(page(rows.map(toTeamDto), total, query));
});

teamsRouter.post("/teams", async (req, res) => {
  const data = parseInput(createTeamSchema, req.body);
  const team = await prisma.team.create({ data });
  res.status(201).json(toTeamDto(team));
});

teamsRouter.get("/teams/:id", async (req, res) => {
  const team = await prisma.team.findUnique({ where: { id: req.params.id } });
  if (!team) throw new NotFoundError("Team not found");
  res.json(toTeamDto(team));
});

teamsRouter.patch("/teams/:id", async (req, res) => {
  const data = parseInput(updateTeamSchema, req.body);
  try {
    const team = await prisma.team.update({ where: { id: req.params.id }, data });
    res.json(toTeamDto(team));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      throw new NotFoundError("Team not found");
    }
    throw e;
  }
});

teamsRouter.delete("/teams/:id", async (req, res) => {
  try {
    await prisma.team.delete({ where: { id: req.params.id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") throw new NotFoundError("Team not found");
      if (e.code === "P2003") throw new ConflictError("Team has members or repositories");
    }
    throw e;
  }
  res.status(204).end();
});
