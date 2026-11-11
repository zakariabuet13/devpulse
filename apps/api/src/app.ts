import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import { pinoHttp } from "pino-http";
import { healthSchema } from "@devpulse/shared";
import type { Assistant } from "./ai/assistant";
import { createAssistantFromEnv } from "./ai/claudeAssistant";
import { createTriagerFromEnv } from "./ai/claudeTriager";
import { createAssistantRouter } from "./routes/assistant";
import type { Triager } from "./ai/triager";
import { createTriageRouter } from "./routes/triage";
import { createGitHubClient } from "./github/client";
import type { GitHubClient } from "./github/types";
import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import { logger } from "./logger";
import { issuesRouter } from "./routes/issues";
import { membersRouter } from "./routes/members";
import { pullRequestsRouter } from "./routes/pullRequests";
import { repositoriesRouter } from "./routes/repositories";
import { createSyncRouter } from "./routes/sync";
import { teamsRouter } from "./routes/teams";

export function createApp({
  github,
  triager,
  assistant,
}: { github?: GitHubClient; triager?: Triager; assistant?: Assistant } = {}) {
  // Built lazily from env on first use unless injected (tests inject a fake).
  let envTriager: Triager | undefined;
  const getTriager = () => (envTriager ??= triager ?? createTriagerFromEnv());
  let envAssistant: Assistant | undefined;
  const getAssistant = () =>
    (envAssistant ??= assistant ?? createAssistantFromEnv());
  const client =
    github ?? createGitHubClient({ token: process.env.GITHUB_TOKEN });
  const app = express();

  app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000" }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => {
        const id = randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
      },
      // Failures are logged once, with full detail, by errorHandler.
      customLogLevel: () => "info",
      customProps: (req) => ({ reqId: req.id }),
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json(healthSchema.parse({ status: "ok" }));
  });

  app.use(teamsRouter);
  app.use(membersRouter);
  app.use(repositoriesRouter);
  app.use(issuesRouter);
  app.use(pullRequestsRouter);
  app.use(createTriageRouter(getTriager));
  app.use(createAssistantRouter(getAssistant));
  app.use(createSyncRouter(client));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
