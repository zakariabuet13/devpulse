import type { ErrorRequestHandler } from "express";
import type { ErrorCode } from "@devpulse/shared";
import { AppError, ValidationError, mapPrismaError } from "../errors";
import { logger } from "../logger";

const GENERIC_500 = "Internal server error";

type Resolved = { status: number; code: ErrorCode; message: string };

// body-parser / http-errors style: has a numeric 4xx `status` and an exposable message.
function isClientHttpError(e: unknown): e is Error & { status: number } {
  if (!(e instanceof Error)) return false;
  const status = (e as { status?: unknown }).status;
  return typeof status === "number" && status >= 400 && status < 500;
}

function resolve(err: unknown): Resolved {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message };
  }
  const prisma = mapPrismaError(err);
  if (prisma) return { status: prisma.status, code: prisma.code, message: prisma.message };
  if (isClientHttpError(err)) {
    return { status: err.status, code: "BAD_REQUEST", message: err.message };
  }
  // Includes a raw ZodError: input must go through `parseInput`, so this is a server bug.
  return { status: 500, code: "INTERNAL", message: GENERIC_500 };
}

// Express identifies error middleware by arity, so all four params must stay declared.
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const { status, code, message } = resolve(err);
  const isServerError = status >= 500;
  const original = err instanceof Error ? err : undefined;

  // Same structure in dev and prod; only 5xx carry a stack.
  logger[isServerError ? "error" : "warn"](
    {
      reqId: req.id,
      req: { method: req.method, url: req.originalUrl },
      status,
      code,
      err: {
        type: original?.constructor.name ?? typeof err,
        message: original?.message ?? String(err),
        code: (err as { code?: unknown } | null)?.code,
        stack: isServerError ? original?.stack : undefined,
      },
    },
    "request failed",
  );

  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.issues });
    return;
  }

  if (process.env.NODE_ENV === "production") {
    res.status(status).json({ error: message });
    return;
  }
  res.status(status).json({ error: { code, message, stack: original?.stack } });
};
