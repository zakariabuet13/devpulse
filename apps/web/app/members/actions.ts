"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { memberSchema, updateMemberSchema } from "@devpulse/shared";
import { apiPatch } from "@/lib/api";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Expected failures (404 team/member, 400) come back as `{ ok: false }` so the list can show
// them next to the member instead of tripping the error boundary.
export async function moveMember(id: string, teamId: string): Promise<ActionResult> {
  const idResult = z.string().min(1).safeParse(id);
  const body = updateMemberSchema.safeParse({ teamId });
  if (!idResult.success || !body.success) return { ok: false, error: "Invalid team move" };

  try {
    await apiPatch(`/members/${encodeURIComponent(idResult.data)}`, body.data, memberSchema);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not move member" };
  }
  refresh();
  return { ok: true };
}
