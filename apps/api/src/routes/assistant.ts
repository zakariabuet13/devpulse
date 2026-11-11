import { Router } from "express";
import { chatRequestSchema, type AssistantEvent } from "@devpulse/shared";
import type { Assistant } from "../ai/assistant";
import { ServiceUnavailableError, parseInput } from "../errors";
import { logger } from "../logger";

const GENERIC_ERROR = "Something went wrong. Please try again.";

// `getAssistant` is called per request so a missing key surfaces as 503, not a boot failure.
export function createAssistantRouter(
  getAssistant: () => Assistant | undefined,
) {
  const router = Router();

  router.post("/assistant/chat", async (req, res) => {
    // Validation first (400), then config (503): both before any streaming starts.
    const { messages } = parseInput(chatRequestSchema, req.body);
    const assistant = getAssistant();
    if (!assistant)
      throw new ServiceUnavailableError("Assistant is not configured");

    // From here on, status is 200: a failure becomes one `error` line.
    const controller = new AbortController();
    let finished = false;
    res.on("close", () => {
      if (!finished) controller.abort();
    });

    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();

    const send = (event: AssistantEvent) => {
      if (!res.writableEnded && !res.destroyed) {
        res.write(`${JSON.stringify(event)}\n`);
      }
    };

    try {
      for await (const event of assistant.chat(messages, {
        signal: controller.signal,
      })) {
        send(event);
      }
    } catch (e) {
      // Class name only: raw messages may hold the key, upstream bodies or model text.
      if (!controller.signal.aborted) {
        logger.warn(
          { reqId: req.id, errType: e instanceof Error ? e.name : typeof e },
          "ai assistant failed",
        );
        send({ type: "error", message: GENERIC_ERROR });
      }
    } finally {
      finished = true;
      res.end();
    }
  });

  return router;
}
