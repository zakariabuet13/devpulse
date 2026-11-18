import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/releaseNotes/args";
import { RELEASE_NOTES_CONFIG } from "../src/releaseNotes/config";

const base = ["--from", "v0.1.0", "--version", "0.2.0"];

describe("parseArgs", () => {
  it("parses required flags and defaults --to to HEAD", () => {
    const a = parseArgs(base);
    expect(a.from).toBe("v0.1.0");
    expect(a.to).toBe("HEAD");
    expect(a.version).toBe("0.2.0");
  });

  it("accepts an explicit --to", () => {
    expect(parseArgs([...base, "--to", "main"]).to).toBe("main");
  });

  it("requires --from", () => {
    expect(() => parseArgs(["--version", "0.2.0"])).toThrow();
  });

  it("requires --version", () => {
    expect(() => parseArgs(["--from", "v0.1.0"])).toThrow();
  });

  it.each(["1.2", "v1.2.3", "1.2.3/../../x", "../evil", "1.2.3 ", "a.b.c", ""])(
    "rejects bad version %j (output path must stay safe)",
    (version) => {
      expect(() => parseArgs(["--from", "a", "--version", version])).toThrow();
    },
  );

  it("rejects unknown flags", () => {
    expect(() => parseArgs([...base, "--bogus", "1"])).toThrow();
  });

  it.each(["--max-turns", "--max-budget", "--abort-after"])(
    "rejects NaN / negative / zero for %s",
    (flag) => {
      for (const bad of ["abc", "-1", "0"]) {
        expect(() => parseArgs([...base, flag, bad])).toThrow();
      }
    },
  );

  it("parses --abort-after as seconds", () => {
    expect(parseArgs([...base, "--abort-after", "30"]).abortAfter).toBe(30);
  });

  it("flags can lower limits", () => {
    const a = parseArgs([...base, "--max-turns", "3", "--max-budget", "0.01"]);
    expect(a.maxTurns).toBe(3);
    expect(a.maxBudget).toBe(0.01);
  });

  it("flags can never raise limits above the config", () => {
    const a = parseArgs([...base, "--max-turns", "999", "--max-budget", "50"]);
    expect(a.maxTurns).toBe(RELEASE_NOTES_CONFIG.maxTurns);
    expect(a.maxBudget).toBe(RELEASE_NOTES_CONFIG.maxBudgetUsd);
  });

  it("without flags the limits equal the config", () => {
    const a = parseArgs(base);
    expect(a.maxTurns).toBe(RELEASE_NOTES_CONFIG.maxTurns);
    expect(a.maxBudget).toBe(RELEASE_NOTES_CONFIG.maxBudgetUsd);
  });
});
