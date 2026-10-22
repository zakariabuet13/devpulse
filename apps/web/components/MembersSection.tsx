import { memberSchema, type Team } from "@devpulse/shared";
import { fetchAll } from "@/lib/api";
import { MemberList } from "./MemberList";

type Props = { teamId: string; q: string; teams: Team[] };

export async function MembersSection({ teamId, q, teams }: Props) {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  const members = await fetchAll(
    `/teams/${encodeURIComponent(teamId)}/members${query}`,
    memberSchema,
  );
  return <MemberList members={members} teams={teams} />;
}

export function MembersSkeleton() {
  return (
    <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="size-8 animate-pulse rounded-full bg-zinc-100" />
          <div className="h-9 flex-1 animate-pulse rounded bg-zinc-100" />
        </div>
      ))}
    </div>
  );
}
