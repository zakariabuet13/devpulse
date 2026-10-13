import type { Priority } from "@devpulse/shared";
import type { BoardIssue } from "@/lib/board";
import { PRIORITIES } from "@/lib/boardLogic";
import { RepoIcon } from "./icons";
import { LabelChip } from "./LabelChip";
import { PrioritySelect } from "./PrioritySelect";

type Props = {
  issues: BoardIssue[];
  onPriorityChange: (id: string, priority: Priority) => void;
};

export function IssueList({ issues, onPriorityChange }: Props) {
  // Urgent first; `sort` is stable, so input order is kept within a priority.
  const rows = [...issues].sort(
    (a, b) => PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority),
  );
  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-zinc-100 font-mono text-[10px] uppercase text-zinc-500">
            <th className="h-10 w-[140px] rounded-tl-lg pl-6 font-normal">Priority</th>
            <th className="font-normal">Issue</th>
            <th className="w-[280px] font-normal">Labels</th>
            <th className="w-[220px] rounded-tr-lg pr-6 font-normal">Repository</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id} data-issue-id={i.id} className="h-14 border-t border-zinc-200">
              <td className="pl-6">
                <span className="inline-block">
                  <PrioritySelect
                    value={i.priority}
                    label={`#${i.number}`}
                    onChange={(p) => onPriorityChange(i.id, p)}
                  />
                </span>
              </td>
              <td>
                <span className="mr-2 font-mono text-[11px] text-zinc-500">#{i.number}</span>
                <span className="text-[13px] font-medium text-zinc-900">{i.title}</span>
              </td>
              <td>
                <span className="flex flex-wrap gap-1.5">
                  {i.labels.map((l) => (
                    <LabelChip key={l} label={l} />
                  ))}
                </span>
              </td>
              <td className="pr-6">
                <span className="flex items-center gap-2 font-mono text-[11px] text-zinc-700">
                  <RepoIcon width={14} height={14} className="text-zinc-500" />
                  {i.repoName}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
