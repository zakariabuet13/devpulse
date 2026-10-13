import type { Priority } from "@devpulse/shared";
import type { BoardIssue } from "@/lib/board";
import { RepoIcon } from "./icons";
import { LabelChip } from "./LabelChip";
import { PrioritySelect } from "./PrioritySelect";

type Props = { issue: BoardIssue; onPriorityChange: (id: string, priority: Priority) => void };

export function IssueCard({ issue, onPriorityChange }: Props) {
  return (
    // Darker border while this card's priority menu is open.
    <li
      data-issue-id={issue.id}
      className="rounded-md border border-zinc-200 bg-white px-[13px] pb-[13px] pt-3.5 has-[[aria-expanded=true]]:border-zinc-500">
      <div className="font-mono text-[10px] text-zinc-500">#{issue.number}</div>
      {/* Two-line min height keeps chip and footer rows aligned across cards. */}
      <h3 className="mt-1 min-h-[34px] text-[13px] font-medium leading-[17px] text-zinc-900">
        {issue.title}
      </h3>
      {issue.labels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {issue.labels.map((l) => (
            <LabelChip key={l} label={l} />
          ))}
        </div>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-zinc-500">
          <RepoIcon width={12} height={12} className="shrink-0 text-zinc-500" />
          <span className="truncate">{issue.repoName}</span>
        </span>
        <PrioritySelect
          value={issue.priority}
          label={`#${issue.number}`}
          onChange={(p) => onPriorityChange(issue.id, p)}
        />
      </div>
    </li>
  );
}
