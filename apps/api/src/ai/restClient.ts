// Tiny read-only loopback client: the assistant reads data through the public REST API,
// never Prisma. Errors carry only the status, never the response body.
export class RestError extends Error {
  constructor(readonly status: number) {
    super(`REST request failed (${status})`);
    this.name = "RestError";
  }
}

const baseUrl = () =>
  process.env.API_SELF_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;

export async function restGet<T>(
  path: string,
  query: Record<string, string | number | undefined> = {},
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(path, baseUrl());
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { signal });
  if (!res.ok) throw new RestError(res.status);
  return (await res.json()) as T;
}
