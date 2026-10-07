import type { Page, PaginationQuery } from "@devpulse/shared";

// Prisma `skip`/`take` from a parsed pagination query.
export function pageArgs({ limit, offset }: PaginationQuery) {
  return { skip: offset, take: limit };
}

export function page<T>(items: T[], total: number, { limit, offset }: PaginationQuery): Page<T> {
  return { items, total, limit, offset };
}
