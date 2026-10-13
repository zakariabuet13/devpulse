import { Suspense } from "react";
import { teamSchema } from "@devpulse/shared";
import { DashboardStats, DashboardStatsSkeleton } from "@/components/DashboardStats";
import { StalePrSection, StalePrSectionSkeleton } from "@/components/StalePrSection";
import { TeamSelect } from "@/components/TeamSelect";
import { fetchAll } from "@/lib/api";

// `PageProps<"/">` is a Next 16 global type; `searchParams` is a Promise.
export default async function Home({ searchParams }: PageProps<"/">) {
  const { team } = await searchParams;
  const teams = await fetchAll("/teams", teamSchema);

  if (teams.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">
        No teams yet. Create one via the API to see its health here.
      </div>
    );
  }

  const requested = typeof team === "string" ? team : undefined;
  const selected = teams.find((t) => t.id === requested) ?? teams[0];

  return (
    <div className="flex flex-col gap-8">
      <div className="-mb-[7px] flex items-start justify-between">
        <div>
          <h1 className="text-[32px] font-normal leading-10 text-zinc-900">Team Health</h1>
          <p className="mt-1 text-[13px] text-zinc-600">
            A clear view of your team&apos;s open work and review bottlenecks.
          </p>
        </div>
        <TeamSelect teams={teams} selectedId={selected.id} />
      </div>
      <Suspense fallback={<DashboardStatsSkeleton />}>
        <DashboardStats teamId={selected.id} />
      </Suspense>
      <Suspense fallback={<StalePrSectionSkeleton />}>
        <StalePrSection teamId={selected.id} />
      </Suspense>
    </div>
  );
}
