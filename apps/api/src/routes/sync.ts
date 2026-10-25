import { Router } from "express";
import { syncResultSchema } from "@devpulse/shared";
import type { GitHubClient } from "../github/types";
import { syncTeam } from "../services/githubSync";

// Factory (not a bare router) so tests can inject a fake GitHubClient.
export function createSyncRouter(github: GitHubClient) {
  const router = Router();

  router.post("/teams/:teamId/sync", async (req, res) => {
    const result = await syncTeam(req.params.teamId, github);
    res.json(syncResultSchema.parse(result));
  });

  return router;
}
