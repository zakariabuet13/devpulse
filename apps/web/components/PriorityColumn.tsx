import type { Priority } from "@devpulse/shared";
import type { BoardIssue } from "@/lib/board";
import { PRIORITY_LABEL } from "@/lib/boardLogic";
import { IssueCard } from "./IssueCard";
import { PriorityIcon } from "./PriorityIcon";

const TONE: Record<Priority, { label: string; pill: string }> = {
  LOW: { label: "text-zinc-900", pill: "bg-zinc-100 text-zinc-500" },
  MEDIUM: { label: "text-zinc-900", pill: "bg-zinc-100 text-zinc-500" },
  HIGH: { label: "text-amber-700", pill: "bg-amber-50 text-amber-700" },
  URGENT: { label: "text-red-700", pill: "bg-red-50 text-red-700" },
};

type Props = {
  priority: Priority;
  issues: BoardIssue[];
  onPriorityChange: (id: string, priority: Priority) => void;
};

export function PriorityColumn({ priority, issues, onPriorityChange }: Props) {
  const tone = TONE[priority];
  const headingId = `column-${priority}`;
  return (
    <section
      aria-labelledby={headingId}
      className="flex min-h-[640px] flex-col rounded-lg border border-zinc-200 bg-zinc-100/60"
    >
      <header className="flex h-[51px] items-center justify-between rounded-t-lg border-b border-zinc-200 bg-white px-4">
        <h2
          id={headingId}
          className={`flex items-center gap-2 font-mono text-[11px] uppercase ${tone.label}`}
        >
          <PriorityIcon priority={priority} />
          {PRIORITY_LABEL[priority]}
        </h2>
        <span className={`rounded px-2 py-0.5 font-mono text-[11px] ${tone.pill}`}>
          {issues.length}
        </span>
      </header>
      {issues.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-zinc-400">No issues</p>
      ) : (
        <ul className="flex flex-col gap-3 p-3">
          {issues.map((i) => (
            <IssueCard key={i.id} issue={i} onPriorityChange={onPriorityChange} />
          ))}
        </ul>
      )}
    </section>
  );
}
