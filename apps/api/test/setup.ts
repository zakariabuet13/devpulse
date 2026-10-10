import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/db";

// Defense in depth: never TRUNCATE anything but a *_test database.
const dbName = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
if (!dbName.endsWith("_test")) {
  throw new Error(`Refusing to run tests against non-test database "${dbName}"`);
}

beforeEach(async () => {
  // Listed dynamically so new models are covered without touching this file.
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});
