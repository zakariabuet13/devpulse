"use client";

import type { Priority } from "@devpulse/shared";
import { startTransition, useMemo, useOptimistic, useState } from "react";
import { updateIssuePriority } from "@/app/issues/actions";
import type { BoardIssue } from "@/lib/board";
import {
  PRIORITIES,
  collectLabels,
  collectRepos,
  filterIssues,
  groupByPriority,
  moveIssue,
  type IssueFilters,
  type MoveAction,
} from "@/lib/boardLogic";
import { ChevronDownIcon, CloseIcon, LockIcon, SearchIcon, SwapIcon } from "./icons";
import { IssueList } from "./IssueList";
import { PriorityColumn } from "./PriorityColumn";
import { ViewToggle, type IssueView } from "./ViewToggle";

type Props = { issues: BoardIssue[]; repoCount: number; view: IssueView; teamId: string };

function FilterSelect({
  value,
  onChange,
  label,
  allLabel,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  allLabel: string;
  options: [value: string, text: string][];
}) {
  return (
    <label className="relative block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="field-sizing-content h-9 appearance-none rounded-md border border-zinc-200 bg-white pl-3 pr-9 text-[13px] text-zinc-900 outline-none focus:border-zinc-400"
      >
        <option value="">{allLabel}</option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        width={14}
        height={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600"
      />
    </label>
  );
}

export function IssueBoard({ issues, repoCount, view, teamId }: Props) {
  // Shows moved cards in their new column while the Server Action runs; when the transition
  // ends React drops the optimistic layer, so a failed update reverts on its own.
  // Explicit `<State, Action>`: TS can't infer `Action` from a generic reducer like `moveIssue`.
  const [optimistic, applyMove] = useOptimistic<BoardIssue[], MoveAction>(issues, moveIssue);
  const [filters, setFilters] = useState<IssueFilters>({ query: "", repo: "", label: "" });
  const [error, setError] = useState<string | null>(null);

  const repos = useMemo(() => collectRepos(issues), [issues]);
  const labels = useMemo(() => collectLabels(issues).map((l) => [l, l] as [string, string]), [issues]);
  const visible = useMemo(() => filterIssues(optimistic, filters), [optimistic, filters]);
  const columns = useMemo(() => groupByPriority(visible), [visible]);

  function onPriorityChange(id: string, priority: Priority) {
    setError(null);
    startTransition(async () => {
      applyMove({ id, priority });
      // The card remounts in another column (or row order changes), dropping focus to <body>;
      // put it back on the moved card's selector once the optimistic render lands.
      requestAnimationFrame(() => {
        if (document.activeElement !== document.body) return;
        document
          .querySelector<HTMLElement>(`[data-issue-id="${id}"] [aria-haspopup="listbox"]`)
          ?.focus();
      });
      const result = await updateIssuePriority(id, priority);
      if (!result.ok) setError(`Couldn't change priority: ${result.error}`);
    });
  }

  const set = (patch: Partial<IssueFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const filtered = visible.length !== optimistic.length;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ViewToggle view={view} teamId={teamId} />
          <label className="relative block">
            <SearchIcon
              width={16}
              height={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              type="search"
              value={filters.query}
              onChange={(e) => set({ query: e.target.value })}
              placeholder="Search issues…"
              aria-label="Search issues"
              className="h-9 w-[240px] rounded-md border border-zinc-200 bg-white pl-10 pr-3 text-[13px] outline-none placeholder:text-zinc-500 focus:border-zinc-400"
            />
          </label>
          <FilterSelect
            value={filters.repo}
            onChange={(repo) => set({ repo })}
            label="Filter by repository"
            allLabel="All repositories"
            options={repos}
          />
          <FilterSelect
            value={filters.label}
            onChange={(label) => set({ label })}
            label="Filter by label"
            allLabel="All labels"
            options={labels}
          />
        </div>
        <p className="font-mono text-[11px] text-zinc-500" aria-live="polite">
          {filtered ? `${visible.length} of ${optimistic.length}` : optimistic.length} open{" "}
          {optimistic.length === 1 ? "issue" : "issues"} · {repoCount}{" "}
          {repoCount === 1 ? "repository" : "repositories"}
        </p>
      </div>

      <div className="mt-[15px] flex items-center justify-between text-xs text-zinc-500">
        <span className="flex items-center gap-2">
          <SwapIcon width={14} height={14} />
          {view === "list"
            ? "Use a row's priority selector to change its priority."
            : "Use a card's priority selector to move it between columns."}
        </span>
        <span className="flex items-center gap-1.5">
          <LockIcon width={13} height={13} />
          All other issue details are read-only
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-800"
        >
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            className="text-red-700 hover:text-red-900"
          >
            <CloseIcon width={16} height={16} />
          </button>
        </div>
      )}

      <div className="mt-[25px]">
        {issues.length === 0 ? (
          <p className="rounded-lg border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500">
            No open issues for this team.
          </p>
        ) : filtered && visible.length === 0 ? (
          <p className="rounded-lg border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500">
            No matches
          </p>
        ) : view === "list" ? (
          <IssueList issues={visible} onPriorityChange={onPriorityChange} />
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {PRIORITIES.map((p) => (
              <PriorityColumn
                key={p}
                priority={p}
                issues={columns[p]}
                onPriorityChange={onPriorityChange}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
