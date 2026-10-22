import { Suspense } from "react";
import { teamSchema } from "@devpulse/shared";
import { MemberSearch } from "@/components/MemberSearch";
import { MembersSection, MembersSkeleton } from "@/components/MembersSection";
import { TeamSelect } from "@/components/TeamSelect";
import { fetchAll } from "@/lib/api";

export default async function MembersPage({
  searchParams,
}: PageProps<"/members">) {
  const { team, q } = await searchParams;
  const teams = await fetchAll("/teams", teamSchema);

  if (teams.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">
        No teams yet. Create one via the API to see its members here.
      </div>
    );
  }

  const requested = typeof team === "string" ? team : undefined;
  const selected = teams.find((t) => t.id === requested) ?? teams[0];
  const query = typeof q === "string" ? q.trim() : "";

  return (
    <div className="flex flex-col gap-8">
      <div className="-mb-[7px] flex items-start justify-between">
        <div>
          <h1 className="text-[32px] font-normal leading-10 text-zinc-900">
            Members
          </h1>
          <p className="mt-1 text-[13px] text-zinc-600">
            Find people on a team and move them to another one.
          </p>
        </div>
        <TeamSelect teams={teams} selectedId={selected.id} />
      </div>
      <MemberSearch />
      {/* The search box stays outside Suspense so it keeps focus while results reload. */}
      <Suspense key={`${selected.id}:${query}`} fallback={<MembersSkeleton />}>
        <MembersSection teamId={selected.id} q={query} teams={teams} />
      </Suspense>
    </div>
  );
}
