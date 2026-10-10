import { prisma } from "../db";
import { NotFoundError } from "../errors";
import { Prisma } from "../generated/prisma/client.js";

export async function ensureTeam(id: string): Promise<void> {
  const team = await prisma.team.findUnique({ where: { id }, select: { id: true } });
  if (!team) throw new NotFoundError("Team not found");
}

export async function ensureRepository(id: string): Promise<void> {
  const repo = await prisma.repository.findUnique({ where: { id }, select: { id: true } });
  if (!repo) throw new NotFoundError("Repository not found");
}

// Turns Prisma's "record to update/delete not found" (P2025) into a specific 404.
export function rethrowMissing(e: unknown, message: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
    throw new NotFoundError(message);
  }
  throw e;
}
