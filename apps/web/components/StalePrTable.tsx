"use client";

import { useMemo, useState } from "react";
import type { StaleRow } from "@/lib/dashboard";
import { formatAge, formatRequestedAt } from "@/lib/stalePrs";
import { Avatar } from "./Avatar";
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  ClockIcon,
  GithubIcon,
  RepoIcon,
  SearchIcon,
  SortIcon,
} from "./icons";

const GH = "https://github.com";

export function StalePrTable({ rows }: { rows: StaleRow[] }) {
  const [query, setQuery] = useState("");
  const [repo, setRepo] = useState("");
  const [oldestFirst, setOldestFirst] = useState(true);

  const repos = useMemo(
    () => [...new Map(rows.map((r) => [r.repoFullName, r.repoName])).entries()],
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter(
      (r) =>
        (!repo || r.repoFullName === repo) &&
        (!q ||
          [
            r.title,
            `#${r.number}`,
            r.repoName,
            r.authorName,
            r.authorLogin,
          ].some((s) => s.toLowerCase().includes(q))),
    );
    // Rows arrive oldest-first.
    return oldestFirst ? filtered : [...filtered].reverse();
  }, [rows, query, repo, oldestFirst]);

  const githubHref = repo
    ? `${GH}/${repo}/pulls`
    : `${GH}/pulls/review-requested`;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-start justify-between px-6 pt-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-semibold text-zinc-900">
              Stale pull requests
            </h2>
            <span className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-amber-700">
              {rows.length}
            </span>
          </div>
          <p className="mt-2 text-[13px] text-zinc-500">
            Awaiting review · review requested more than 3 days ago
          </p>
        </div>
        <a
          href={githubHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 items-center gap-2 rounded-md border border-zinc-200 px-3 text-[13px] font-medium text-zinc-900"
        >
          <GithubIcon width={16} height={16} />
          Open in GitHub
          <ArrowUpRightIcon width={14} height={14} />
        </a>
      </div>

      <div className="flex items-center justify-between px-6 pb-5 pt-5">
        <div className="flex items-center gap-2.5">
          <label className="relative block">
            <SearchIcon
              width={16}
              height={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stale PRs…"
              aria-label="Search stale PRs"
              className="h-9 w-[270px] rounded-md border border-zinc-200 pl-10 pr-3 text-[13px] outline-none placeholder:text-zinc-500 focus:border-zinc-400"
            />
          </label>
          <label className="relative block">
            <select
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              aria-label="Filter by repository"
              className="h-9 appearance-none rounded-md border border-zinc-200 bg-white pl-3 pr-9 text-[13px] text-zinc-900 outline-none focus:border-zinc-400"
            >
              <option value="">All repositories</option>
              {repos.map(([full, name]) => (
                <option key={full} value={full}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              width={14}
              height={14}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600"
            />
          </label>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          Sort by
          <button
            type="button"
            onClick={() => setOldestFirst((v) => !v)}
            className="flex h-9 items-center gap-2 rounded-md border border-zinc-200 px-3.5 text-[13px] text-zinc-900"
          >
            <SortIcon width={15} height={15} />
            {oldestFirst ? "Oldest request first" : "Newest request first"}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="border-t border-zinc-200 px-6 py-12 text-center text-sm text-zinc-500">
          No stale PRs 🎉
        </p>
      ) : visible.length === 0 ? (
        <p className="border-t border-zinc-200 px-6 py-12 text-center text-sm text-zinc-500">
          No matches
        </p>
      ) : (
        <table className="w-full border-t border-zinc-200 text-left">
          <thead>
            <tr className="bg-zinc-100 font-mono text-[10px] uppercase text-zinc-500">
              <th className="h-10 w-[192px] pl-6 font-normal">Repository</th>
              <th className="w-[540px] font-normal">Pull request</th>
              <th className="w-[188px] font-normal">Author</th>
              <th className="font-normal">Since review requested</th>
              <th className="w-14" />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.id}
                className="h-[76px] border-t border-zinc-200 first:border-t-0"
              >
                <td className="pl-6">
                  <span className="flex items-center gap-3 font-mono text-[11px] text-zinc-900">
                    <RepoIcon
                      width={16}
                      height={16}
                      className="text-zinc-600"
                    />
                    {r.repoName}
                  </span>
                </td>
                <td>
                  <div className="text-[13px] font-medium text-zinc-900">
                    {r.title}
                  </div>
                  <div className="mt-1.5 font-mono text-[10px] text-zinc-500">
                    #{r.number}
                  </div>
                </td>
                <td>
                  <span className="flex items-center gap-3">
                    <Avatar name={r.authorName} />
                    <span>
                      <span className="block text-xs text-zinc-900">
                        {r.authorName}
                      </span>
                      <span className="mt-1 block font-mono text-[10px] text-zinc-500">
                        @{r.authorLogin}
                      </span>
                    </span>
                  </span>
                </td>
                <td>
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-700">
                    <ClockIcon width={14} height={14} />
                    {formatAge(r.ageMs)}
                  </span>
                  <span className="mt-1 block font-mono text-[10px] text-zinc-500">
                    {formatRequestedAt(r.reviewRequestedAt)}
                  </span>
                </td>
                <td className="pr-6 text-right">
                  <a
                    href={`${GH}/${r.repoFullName}/pull/${r.number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open #${r.number} in GitHub`}
                    className="inline-flex text-zinc-600"
                  >
                    <ArrowUpRightIcon width={16} height={16} />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
