import { getBoard } from "@/lib/board";
import { IssueBoard } from "./IssueBoard";
import type { IssueView } from "./ViewToggle";

type Props = { teamId: string; view: IssueView };

export async function IssuesBoardSection({ teamId, view }: Props) {
  const { issues, repoCount } = await getBoard(teamId);
  return (
    <IssueBoard
      issues={issues}
      repoCount={repoCount}
      view={view}
      teamId={teamId}
    />
  );
}

export function IssueBoardSkeleton() {
  return (
    <div>
      <div className="h-9 w-[640px] animate-pulse rounded bg-zinc-100" />
      <div className="mt-[15px] h-4 w-80 animate-pulse rounded bg-zinc-100" />
      <div className="mt-[25px] grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((c) => (
          <div
            key={c}
            className="min-h-[640px] rounded-lg border border-zinc-200 bg-zinc-50 p-3"
          >
            <div className="h-6 w-24 animate-pulse rounded bg-zinc-100" />
            <div className="mt-6 space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[134px] animate-pulse rounded-md bg-zinc-100"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
