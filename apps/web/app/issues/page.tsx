import { Suspense } from "react";
import { teamSchema } from "@devpulse/shared";
import { IssueBoardSkeleton, IssuesBoardSection } from "@/components/IssuesBoardSection";
import { TeamSelect } from "@/components/TeamSelect";
import { fetchAll } from "@/lib/api";

export default async function IssuesPage({ searchParams }: PageProps<"/issues">) {
  const { team, view } = await searchParams;
  const teams = await fetchAll("/teams", teamSchema);

  if (teams.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">
        No teams yet. Create one via the API to see its issues here.
      </div>
    );
  }

  const requested = typeof team === "string" ? team : undefined;
  const selected = teams.find((t) => t.id === requested) ?? teams[0];

  return (
    <div className="flex flex-col gap-8">
      <div className="-mb-[7px] flex items-start justify-between">
        <div>
          <h1 className="text-[32px] font-normal leading-10 text-zinc-900">Issues</h1>
          <p className="mt-1 text-[13px] text-zinc-600">
            A clear view of your team&apos;s open issues, organized by priority.
          </p>
        </div>
        <TeamSelect teams={teams} selectedId={selected.id} />
      </div>
      {/* Keyed by team so switching teams shows the skeleton and resets the filters. */}
      <Suspense key={selected.id} fallback={<IssueBoardSkeleton />}>
        <IssuesBoardSection teamId={selected.id} view={view === "list" ? "list" : "board"} />
      </Suspense>
    </div>
  );
}
