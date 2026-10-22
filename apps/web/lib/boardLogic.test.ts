import type { Priority } from "@devpulse/shared";
import { describe, expect, it } from "vitest";
import {
  collectLabels,
  collectRepos,
  filterIssues,
  groupByPriority,
  labelTone,
  moveIssue,
} from "./boardLogic";

const issue = (
  id: string,
  number: number,
  title: string,
  priority: Priority,
  labels: string[],
  repoName: string,
) => ({
  id,
  number,
  title,
  priority,
  labels,
  repoName,
  repoFullName: `devpulse/${repoName}`,
});

const rows = [
  issue(
    "a",
    142,
    "Document local development setup",
    "LOW",
    ["documentation"],
    "developer-cli",
  ),
  issue(
    "b",
    512,
    "Rate limiter drops valid requests",
    "HIGH",
    ["bug", "api"],
    "api-gateway",
  ),
  issue(
    "c",
    518,
    "Production gateway returns 502s",
    "URGENT",
    ["incident"],
    "api-gateway",
  ),
  issue(
    "d",
    226,
    "Remove unused Terraform outputs",
    "LOW",
    ["cleanup"],
    "infra",
  ),
];

const none = { query: "", repo: "", label: "" };
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("groupByPriority", () => {
  it("returns all 4 keys, including empty ones, and keeps input order", () => {
    const g = groupByPriority(rows);
    expect(Object.keys(g)).toEqual(["LOW", "MEDIUM", "HIGH", "URGENT"]);
    expect(ids(g.LOW)).toEqual(["a", "d"]);
    expect(g.MEDIUM).toEqual([]);
    expect(ids(g.HIGH)).toEqual(["b"]);
    expect(g.URGENT[0].repoName).toBe("api-gateway");
  });

  it("handles empty input", () => {
    expect(groupByPriority([])).toEqual({
      LOW: [],
      MEDIUM: [],
      HIGH: [],
      URGENT: [],
    });
  });
});

describe("filterIssues", () => {
  it("returns everything for empty filters (whitespace query too)", () => {
    expect(filterIssues(rows, none)).toEqual(rows);
    expect(filterIssues(rows, { ...none, query: "   " })).toEqual(rows);
  });

  it("matches title, #number and repo name case-insensitively", () => {
    expect(ids(filterIssues(rows, { ...none, query: "RATE" }))).toEqual(["b"]);
    expect(ids(filterIssues(rows, { ...none, query: "#142" }))).toEqual(["a"]);
    expect(ids(filterIssues(rows, { ...none, query: "Api-Gateway" }))).toEqual([
      "b",
      "c",
    ]);
    expect(filterIssues(rows, { ...none, query: "nothing" })).toEqual([]);
  });

  it("filters by repo full name and label exactly", () => {
    expect(
      ids(filterIssues(rows, { ...none, repo: "devpulse/infra" })),
    ).toEqual(["d"]);
    expect(filterIssues(rows, { ...none, repo: "infra" })).toEqual([]);
    expect(ids(filterIssues(rows, { ...none, label: "bug" }))).toEqual(["b"]);
    expect(filterIssues(rows, { ...none, label: "bu" })).toEqual([]);
  });

  it("combines filters", () => {
    const f = { query: "502", repo: "devpulse/api-gateway", label: "incident" };
    expect(ids(filterIssues(rows, f))).toEqual(["c"]);
    expect(filterIssues(rows, { ...f, label: "bug" })).toEqual([]);
  });
});

describe("moveIssue", () => {
  it("updates only the target and does not mutate the input", () => {
    const before = structuredClone(rows);
    const out = moveIssue(rows, { id: "a", priority: "URGENT" });
    expect(out.find((i) => i.id === "a")?.priority).toBe("URGENT");
    expect(out.filter((i) => i.id !== "a")).toEqual(
      rows.filter((i) => i.id !== "a"),
    );
    expect(out[1]).toBe(rows[1]); // untouched rows keep identity
    expect(rows).toEqual(before);
    expect(out).not.toBe(rows);
  });

  it("is a no-op for an unknown id", () => {
    expect(moveIssue(rows, { id: "zzz", priority: "LOW" })).toEqual(rows);
  });
});

describe("collect", () => {
  it("dedupes and sorts labels", () => {
    expect(collectLabels(rows)).toEqual([
      "api",
      "bug",
      "cleanup",
      "documentation",
      "incident",
    ]);
  });

  it("dedupes and sorts repos by name", () => {
    expect(collectRepos(rows)).toEqual([
      ["devpulse/api-gateway", "api-gateway"],
      ["devpulse/developer-cli", "developer-cli"],
      ["devpulse/infra", "infra"],
    ]);
  });
});

describe("labelTone", () => {
  it("maps bug → amber, incident → red, others → neutral", () => {
    expect(labelTone("bug")).toBe("amber");
    expect(labelTone("Bug")).toBe("amber");
    expect(labelTone("incident")).toBe("red");
    expect(labelTone("enhancement")).toBe("neutral");
    expect(labelTone("")).toBe("neutral");
  });
});
