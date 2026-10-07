import { config } from "dotenv";

// Resolve apps/api/.env relative to this file, not process.cwd(): the server is also started
// from the repo root (`npx tsx apps/api/src/index.ts`), where a cwd-based lookup finds nothing.
// Import this first so process.env is populated before other modules read it.
config({ path: new URL("../.env", import.meta.url) });
