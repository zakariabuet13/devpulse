import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    setupFiles: ["test/setup.ts"],
    // All test files share one database; run them one at a time.
    fileParallelism: false,
    // dotenv never overrides existing vars, so these win over apps/api/.env.
    env: {
      DATABASE_URL:
        "postgresql://postgres:postgres@localhost:5435/devpulse_test?schema=public",
      LOG_LEVEL: "silent",
      // Tests never reach the network; an empty key means "AI triage is not configured".
      ANTHROPIC_API_KEY: "",
      DOTENV_CONFIG_QUIET: "true",
    },
  },
});
