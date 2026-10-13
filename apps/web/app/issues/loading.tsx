import { IssueBoardSkeleton } from "@/components/IssuesBoardSection";

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="h-16 w-96 animate-pulse rounded bg-zinc-100" />
      <IssueBoardSkeleton />
    </div>
  );
}
