import { describe, expect, it } from "vitest";
import { formatAge, formatRequestedAt, getStalePrs } from "./stalePrs";

const now = new Date("2026-10-13T08:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const H = 3_600_000;
const D = 24 * H;

const pr = (id: string, state: "OPEN" | "CLOSED" | "MERGED", reviewRequestedAt: string | null) => ({
  id,
  state,
  reviewRequestedAt,
});

describe("getStalePrs", () => {
  it("excludes CLOSED/MERGED and null reviewRequestedAt", () => {
    const rows = [
      pr("closed", "CLOSED", ago(5 * D)),
      pr("merged", "MERGED", ago(5 * D)),
      pr("none", "OPEN", null),
    ];
    expect(getStalePrs(rows, now)).toEqual([]);
  });

  it("excludes exactly 3d and 2d23h, includes 3d+1min", () => {
    const rows = [
      pr("exact", "OPEN", ago(3 * D)),
      pr("under", "OPEN", ago(2 * D + 23 * H)),
      pr("over", "OPEN", ago(3 * D + 60_000)),
    ];
    expect(getStalePrs(rows, now).map((r) => r.pr.id)).toEqual(["over"]);
  });

  it("sorts oldest first and keeps extra fields", () => {
    const rows = [
      { ...pr("a", "OPEN", ago(4 * D)), extra: 1 },
      { ...pr("b", "OPEN", ago(7 * D)), extra: 2 },
    ];
    const out = getStalePrs(rows, now);
    expect(out.map((r) => r.pr.id)).toEqual(["b", "a"]);
    expect(out[0].pr.extra).toBe(2);
    expect(out[0].ageMs).toBe(7 * D);
  });

  it("handles empty input and a custom threshold", () => {
    expect(getStalePrs([], now)).toEqual([]);
    expect(getStalePrs([pr("x", "OPEN", ago(2 * H))], now, H)).toHaveLength(1);
  });
});

describe("formatters", () => {
  it("formatAge", () => {
    expect(formatAge(7 * D + 2 * H)).toBe("7d 2h");
    expect(formatAge(3 * D + 8 * H + 59 * 60_000)).toBe("3d 8h");
    expect(formatAge(0)).toBe("0d 0h");
  });

  it("formatRequestedAt uses UTC", () => {
    expect(formatRequestedAt("2026-10-06T08:00:00.000Z")).toBe("Oct 06, 08:00 UTC");
    expect(formatRequestedAt("2026-10-10T02:05:00.000Z")).toBe("Oct 10, 02:05 UTC");
  });
});
