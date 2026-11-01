import { Router } from "express";
import { triageResultSchema } from "@devpulse/shared";
import type { Triager } from "../ai/triager";
import { prisma } from "../db";
import {
  BadGatewayError,
  NotFoundError,
  ServiceUnavailableError,
} from "../errors";
import { logger } from "../logger";

// `getTriager` is called per request so a missing key surfaces as 503, not a boot failure.
export function createTriageRouter(getTriager: () => Triager | undefined) {
  const router = Router();

  // Read-only: returns a suggestion; a person applies it later via PATCH /issues/:id.
  router.post("/issues/:id/triage", async (req, res) => {
    const issue = await prisma.issue.findUnique({
      where: { id: req.params.id },
      select: { title: true, body: true },
    });
    if (!issue) throw new NotFoundError("Issue not found");

    const triager = getTriager();
    if (!triager)
      throw new ServiceUnavailableError("AI triage is not configured");

    let suggestion;
    try {
      suggestion = triageResultSchema.parse(await triager.triage(issue));
    } catch (e) {
      // Class name only: raw messages may hold the key or model text.
      logger.warn(
        { reqId: req.id, errType: e instanceof Error ? e.name : typeof e },
        "ai triage failed",
      );
      throw new BadGatewayError("AI triage failed");
    }
    res.json(suggestion);
  });

  return router;
}
