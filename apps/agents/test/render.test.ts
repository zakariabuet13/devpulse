import { describe, expect, it } from "vitest";
import { render } from "../src/releaseNotes/render";
import { releaseNotesSchema } from "../src/releaseNotes/schema";

const notes = {
  features: [
    { text: "Kanban board", pr: 12 },
    { text: "Team search", pr: 14 },
  ],
  fixes: [{ text: "Crash on empty team", pr: 7 }],
  internal: [{ text: "Bump deps", pr: 20 }],
};

describe("render", () => {
  it("emits a version title and sections in order Features, Fixes, Internal", () => {
    const md = render("0.2.0", notes);
    expect(md).toContain("0.2.0");
    const f = md.indexOf("Features");
    const x = md.indexOf("Fixes");
    const i = md.indexOf("Internal");
    expect(f).toBeGreaterThanOrEqual(0);
    expect(x).toBeGreaterThan(f);
    expect(i).toBeGreaterThan(x);
  });

  it("keeps order even when the JSON keys arrive shuffled", () => {
    const shuffled = {
      internal: notes.internal,
      fixes: notes.fixes,
      features: notes.features,
    };
    const md = render("0.2.0", shuffled);
    expect(md.indexOf("Features")).toBeLessThan(md.indexOf("Fixes"));
    expect(md.indexOf("Fixes")).toBeLessThan(md.indexOf("Internal"));
  });

  it("renders one '- text (#n)' line per item", () => {
    const lines = render("0.2.0", notes)
      .split("\n")
      .filter((l) => l.startsWith("- "));
    expect(lines).toEqual([
      "- Kanban board (#12)",
      "- Team search (#14)",
      "- Crash on empty team (#7)",
      "- Bump deps (#20)",
    ]);
  });

  it("every bullet line with a PR carries a (#n)", () => {
    for (const l of render("0.2.0", notes)
      .split("\n")
      .filter((l) => l.startsWith("- "))) {
      expect(l).toMatch(/\(#\d+\)$/);
    }
  });

  it("an item without a PR renders with no (#n)", () => {
    const md = render("0.2.0", {
      features: [],
      fixes: [],
      internal: [{ text: "Squashed setup" }],
    });
    expect(md).toContain("- Squashed setup\n");
    expect(md).not.toContain("(#");
  });

  it("omits empty sections", () => {
    const md = render("0.2.0", {
      features: [],
      fixes: notes.fixes,
      internal: [],
    });
    expect(md).toContain("Fixes");
    expect(md).not.toContain("Features");
    expect(md).not.toContain("Internal");
  });

  it("ends with a single trailing newline", () => {
    const md = render("0.2.0", notes);
    expect(md.endsWith("\n")).toBe(true);
    expect(md.endsWith("\n\n")).toBe(false);
  });
});

describe("releaseNotesSchema", () => {
  it("accepts the expected shape", () => {
    expect(releaseNotesSchema.safeParse(notes).success).toBe(true);
  });

  it("accepts items without a PR number (merges, direct pushes)", () => {
    const ok = { ...notes, features: [{ text: "No number" }] };
    expect(releaseNotesSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects a zero or negative PR number", () => {
    const bad = { ...notes, fixes: [{ text: "x", pr: 0 }] };
    expect(releaseNotesSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-integer PR number and missing sections", () => {
    expect(
      releaseNotesSchema.safeParse({
        ...notes,
        fixes: [{ text: "x", pr: 1.5 }],
      }).success,
    ).toBe(false);
    expect(
      releaseNotesSchema.safeParse({ features: [], fixes: [] }).success,
    ).toBe(false);
  });
});
