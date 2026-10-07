import { prisma } from "../db";
import { ConflictError, NotFoundError } from "../errors";
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

// App-level case-insensitive uniqueness (no raw index). Known gap: a race between this check
// and the write can slip through for differing case; exact-case races hit the @unique (P2002).
export async function assertLoginFree(githubLogin: string, selfId?: string): Promise<void> {
  const clash = await prisma.member.findFirst({
    where: {
      githubLogin: { equals: githubLogin, mode: "insensitive" },
      // Spread, not `NOT: { id: undefined }`: Prisma treats that as NOT {} = match nothing.
      ...(selfId ? { NOT: { id: selfId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new ConflictError("githubLogin already exists");
}

export async function assertFullNameFree(githubFullName: string, selfId?: string): Promise<void> {
  const clash = await prisma.repository.findFirst({
    where: {
      githubFullName: { equals: githubFullName, mode: "insensitive" },
      ...(selfId ? { NOT: { id: selfId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new ConflictError("githubFullName already exists");
}
