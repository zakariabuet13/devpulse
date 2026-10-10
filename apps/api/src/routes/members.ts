import { Router } from "express";
import {
  createMemberSchema,
  paginationQuerySchema,
  updateMemberSchema,
} from "@devpulse/shared";
import { prisma } from "../db";
import { toMemberDto } from "../dto";
import { NotFoundError, parseInput } from "../errors";
import { ensureTeam, rethrowMissing } from "../lib/guards";
import { page, pageArgs } from "../lib/pagination";

export const membersRouter = Router();

membersRouter.get("/teams/:teamId/members", async (req, res) => {
  const query = parseInput(paginationQuerySchema, req.query);
  const where = { teamId: req.params.teamId };
  await ensureTeam(req.params.teamId);
  const [rows, total] = await Promise.all([
    prisma.member.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      ...pageArgs(query),
    }),
    prisma.member.count({ where }),
  ]);
  res.json(page(rows.map(toMemberDto), total, query));
});

membersRouter.post("/teams/:teamId/members", async (req, res) => {
  const data = parseInput(createMemberSchema, req.body);
  await ensureTeam(req.params.teamId);
  const member = await prisma.member.create({
    data: { ...data, teamId: req.params.teamId },
  });
  res.status(201).json(toMemberDto(member));
});

membersRouter.get("/members/:id", async (req, res) => {
  const member = await prisma.member.findUnique({ where: { id: req.params.id } });
  if (!member) throw new NotFoundError("Member not found");
  res.json(toMemberDto(member));
});

membersRouter.patch("/members/:id", async (req, res) => {
  const data = parseInput(updateMemberSchema, req.body);
  const id = req.params.id;
  const existing = await prisma.member.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Member not found");
  if (data.teamId) await ensureTeam(data.teamId);
  try {
    const member = await prisma.member.update({ where: { id }, data });
    res.json(toMemberDto(member));
  } catch (e) {
    rethrowMissing(e, "Member not found");
  }
});

membersRouter.delete("/members/:id", async (req, res) => {
  try {
    await prisma.member.delete({ where: { id: req.params.id } });
  } catch (e) {
    rethrowMissing(e, "Member not found");
  }
  res.status(204).end();
});
