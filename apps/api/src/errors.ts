import type { z } from "zod";
import type { ErrorCode } from "@devpulse/shared";
import { Prisma } from "./generated/prisma/client.js";

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(409, "CONFLICT", message);
  }
}

export class ValidationError extends AppError {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super(400, "VALIDATION", "Validation failed");
  }
}

// `S extends z.ZodType` keeps the schema's concrete type, so the return type
// `z.output<S>` is the parsed value (e.g. defaults applied) rather than `unknown`.
// Use for request body and query only; a ZodError from anywhere else is a server bug (500).
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new ValidationError(result.error.issues);
  return result.data;
}

// adapter-pg puts the violated constraint at meta.driverAdapterError.cause.constraint.index
// (no meta.target), e.g. "Member_githubLogin_key".
function constraintName(e: Prisma.PrismaClientKnownRequestError): string | undefined {
  const meta = e.meta as
    | { driverAdapterError?: { cause?: { constraint?: { index?: string } } } }
    | undefined;
  return meta?.driverAdapterError?.cause?.constraint?.index;
}

const UNIQUE_MESSAGES: Record<string, string> = {
  Member_githubLogin_key: "githubLogin already exists",
  Repository_githubFullName_key: "githubFullName already exists",
};

export function mapPrismaError(e: unknown): AppError | undefined {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return undefined;
  switch (e.code) {
    case "P2002": {
      const name = constraintName(e);
      return new ConflictError((name && UNIQUE_MESSAGES[name]) ?? "Resource already exists");
    }
    case "P2025":
      return new NotFoundError("Resource not found");
    case "P2003":
      return new ConflictError("Conflicting reference");
    default:
      return undefined;
  }
}
