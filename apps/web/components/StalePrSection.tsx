import { getDashboard } from "@/lib/dashboard";
import { StalePrTable } from "./StalePrTable";

export async function StalePrSection({ teamId }: { teamId: string }) {
  const { stale } = await getDashboard(teamId);
  return <StalePrTable rows={stale} />;
}

export function StalePrSectionSkeleton() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6">
      <div className="h-6 w-48 animate-pulse rounded bg-zinc-100" />
      <div className="mt-8 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded bg-zinc-100" />
        ))}
      </div>
    </div>
  );
}
