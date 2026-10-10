import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { TestProject } from "vitest/node";

const apiRoot = fileURLToPath(new URL("..", import.meta.url));

// Runs once per `vitest run`: ensure the test DB exists and is migrated.
export default async function setup(project: TestProject) {
  const databaseUrl = project.config.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("test.env.DATABASE_URL is not set");

  const url = new URL(databaseUrl);
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith("_test")) {
    throw new Error(`Refusing to run tests against non-test database "${dbName}"`);
  }

  // CREATE DATABASE can't target the DB we're connected to; use the maintenance DB.
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName],
    );
    // Identifiers can't be parameterized; dbName passed the _test guard above.
    if (!rowCount) await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }

  execSync("npx prisma migrate deploy", {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}
