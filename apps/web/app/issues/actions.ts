"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { issueSchema, updateIssueSchema, type Priority } from "@devpulse/shared";
import { apiPatch } from "@/lib/api";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Expected failures come back as `{ ok: false }` so the board can revert the card and show a
// banner instead of tripping the error boundary.
export async function updateIssuePriority(id: string, priority: Priority): Promise<ActionResult> {
  const idResult = z.string().min(1).safeParse(id);
  const body = updateIssueSchema.safeParse({ priority });
  if (!idResult.success || !body.success) return { ok: false, error: "Invalid priority update" };

  try {
    await apiPatch(`/issues/${encodeURIComponent(idResult.data)}`, body.data, issueSchema);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update priority" };
  }
  refresh();
  return { ok: true };
}
