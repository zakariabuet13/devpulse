import pino from "pino";

// JSON lines in every env (no pino-pretty) so log structure is identical in dev and prod.
// pino's default `err` serializer expects an Error instance and would mangle the plain
// `{ type, message, code, stack }` object errorHandler builds, so pass it through as-is.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  serializers: { err: (err: unknown) => err },
});
