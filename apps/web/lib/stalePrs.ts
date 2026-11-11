// The stale rule lives in packages/shared so the web table and the assistant tool agree.
export { STALE_THRESHOLD_MS, getStalePrs } from "@devpulse/shared";

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
