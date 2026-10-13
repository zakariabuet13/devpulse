import type { PullRequest } from "@devpulse/shared";

export const STALE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

// `T extends Pick<PullRequest, ...>`: callers may pass richer rows (e.g. joined with repo and
// author); only these two fields are required, and the extra fields come back untouched
// because the result is typed `{ pr: T }` rather than `{ pr: PullRequest }`.
export function getStalePrs<T extends Pick<PullRequest, "state" | "reviewRequestedAt">>(
  prs: T[],
  now: Date,
  thresholdMs: number = STALE_THRESHOLD_MS,
): { pr: T; ageMs: number }[] {
  const out: { pr: T; ageMs: number }[] = [];
  for (const pr of prs) {
    if (pr.state !== "OPEN" || pr.reviewRequestedAt === null) continue;
    const ageMs = now.getTime() - new Date(pr.reviewRequestedAt).getTime();
    if (ageMs > thresholdMs) out.push({ pr, ageMs });
  }
  return out.sort((a, b) => b.ageMs - a.ageMs);
}

export function formatAge(ms: number): string {
  const totalHours = Math.floor(ms / 3_600_000);
  return `${Math.floor(totalHours / 24)}d ${totalHours % 24}h`;
}

const requestedAtFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatRequestedAt(iso: string): string {
  return `${requestedAtFormat.format(new Date(iso))} UTC`;
}
