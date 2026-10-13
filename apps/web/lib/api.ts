import { paginated } from "@devpulse/shared";
import type { z } from "zod";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

// Error body is `{ error: ZodIssue[] }` | `{ error: string }` | `{ error: { message } }`.
function errorMessage(body: unknown, status: number): string {
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === "string") return error;
  if (Array.isArray(error)) {
    return error.map((i: { message?: string }) => i.message ?? "Invalid input").join("; ");
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return `API request failed (${status})`;
}

// `T extends z.ZodType`: any zod schema; `z.output<T>` returns its parsed type, not `unknown`.
async function request<T extends z.ZodType>(
  path: string,
  schema: T,
  init?: RequestInit,
): Promise<z.output<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new Error("Cannot reach the DevPulse API");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorMessage(body, res.status));
  return schema.parse(body);
}

export function apiGet<T extends z.ZodType>(path: string, schema: T): Promise<z.output<T>> {
  return request(path, schema);
}

export function apiPatch<T extends z.ZodType>(
  path: string,
  body: unknown,
  schema: T,
): Promise<z.output<T>> {
  return request(path, schema, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchAll<T extends z.ZodType>(
  path: string,
  itemSchema: T,
): Promise<z.output<T>[]> {
  const pageSchema = paginated(itemSchema);
  const sep = path.includes("?") ? "&" : "?";
  const items: z.output<T>[] = [];
  let offset = 0;
  for (;;) {
    const page = await apiGet(`${path}${sep}limit=100&offset=${offset}`, pageSchema);
    items.push(...page.items);
    offset += 100;
    if (offset >= page.total) return items;
  }
}
