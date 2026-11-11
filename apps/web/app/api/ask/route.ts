import { chatRequestSchema } from "@devpulse/shared";
import { API_URL } from "@/lib/api";

// Passes the API's NDJSON stream straight through; validates the body first so bad input
// never reaches the API. POST handlers are not cached by Next.
export async function POST(req: Request) {
  const parsed = chatRequestSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/assistant/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
      // Client disconnect aborts the upstream request, which aborts the Claude call.
      signal: req.signal,
    });
  } catch {
    return Response.json(
      { error: "Cannot reach the DevPulse API" },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}
