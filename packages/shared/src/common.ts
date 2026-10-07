import { z } from "zod";

export const healthSchema = z.object({
  status: z.literal("ok"),
});

export type Health = z.infer<typeof healthSchema>;

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// Generic `T extends z.ZodType`: the helper accepts any Zod schema and `z.array(item)` keeps
// that exact type, so `paginated(teamSchema)` infers `items: Team[]` rather than `unknown[]`.
export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  });

export type Page<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

// "A,B" -> ["A", "B"], each validated by `item`. Apply `.optional()` at the call site.
// `T extends z.ZodType<string, string>` = a schema whose input and output are both strings
// (e.g. an enum). `.pipe` needs the array's input to be `string[]`, so a bare `z.ZodType`
// (input `unknown`) is rejected; the output stays `z.output<T>[]`.
export const csvOf = <T extends z.ZodType<string, string>>(item: T) =>
  z
    .string()
    .transform((s) => s.split(","))
    .pipe(z.array(item).min(1));

export const sortOrderSchema = z.enum(["asc", "desc"]);

export type SortOrder = z.infer<typeof sortOrderSchema>;

export const errorCodeSchema = z.enum([
  "VALIDATION",
  "BAD_REQUEST",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL",
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

// Dev-mode envelope for non-validation errors. Validation errors are `{ error: ZodIssue[] }`;
// production non-validation errors are `{ error: string }`.
export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    stack: z.string().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

// Update bodies: unknown keys -> 400 (strict) and `{}` -> 400 (at least one key).
export const atLeastOneKey = (o: object) => Object.keys(o).length > 0;
export const atLeastOneKeyMessage = { message: "At least one field is required" };
