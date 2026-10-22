import type { Issue, Priority } from "@devpulse/shared";

export const PRIORITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
] as const satisfies readonly Priority[];

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

// `T extends Pick<Issue, ...>`: callers pass joined rows (issue + repo names); only the listed
// fields are required, and because results are typed `T[]` the extra fields come back intact.
export function groupByPriority<T extends Pick<Issue, "priority">>(
  issues: T[],
): Record<Priority, T[]> {
  const out: Record<Priority, T[]> = {
    LOW: [],
    MEDIUM: [],
    HIGH: [],
    URGENT: [],
  };
  for (const issue of issues) out[issue.priority].push(issue);
  return out;
}

export type IssueFilters = { query: string; repo: string; label: string };

type Filterable = Pick<Issue, "title" | "number" | "labels"> & {
  repoName: string;
  repoFullName: string;
};

// Search is case-insensitive over title, `#number` and repo name; `repo` (full name) and
// `label` are exact matches, and an empty string means "all".
export function filterIssues<T extends Filterable>(
  issues: T[],
  filters: IssueFilters,
): T[] {
  const q = filters.query.trim().toLowerCase();
  return issues.filter(
    (i) =>
      (!filters.repo || i.repoFullName === filters.repo) &&
      (!filters.label || i.labels.includes(filters.label)) &&
      (!q ||
        [i.title, `#${i.number}`, i.repoName].some((s) =>
          s.toLowerCase().includes(q),
        )),
  );
}

export type MoveAction = { id: string; priority: Priority };

// `useOptimistic` reducer: returns a new array and never mutates the input.
export function moveIssue<T extends Pick<Issue, "id" | "priority">>(
  issues: T[],
  { id, priority }: MoveAction,
): T[] {
  return issues.map((i) => (i.id === id ? { ...i, priority } : i));
}

export function collectLabels(issues: Pick<Issue, "labels">[]): string[] {
  return [...new Set(issues.flatMap((i) => i.labels))].sort();
}

// [fullName, name] pairs, sorted by name; fullName is the filter value.
export function collectRepos(
  issues: { repoName: string; repoFullName: string }[],
): [string, string][] {
  return [
    ...new Map(issues.map((i) => [i.repoFullName, i.repoName])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
}

export type LabelTone = "amber" | "red" | "neutral";

export function labelTone(label: string): LabelTone {
  const l = label.toLowerCase();
  if (l === "bug") return "amber";
  if (l === "incident") return "red";
  return "neutral";
}
