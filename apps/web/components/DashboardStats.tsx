import { getDashboard } from "@/lib/dashboard";
import { ClockIcon, CommentIcon, IssueIcon, PullRequestIcon } from "./icons";
import { StatCard, StatCardSkeleton } from "./StatCard";

export async function DashboardStats({ teamId }: { teamId: string }) {
  const d = await getDashboard(teamId);
  const across = `Across ${d.repoCount} ${d.repoCount === 1 ? "repository" : "repositories"}`;
  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard
        label="Open issues"
        value={d.openIssues}
        subline={across}
        icon={<IssueIcon />}
      />
      <StatCard
        label="Open PRs"
        value={d.openPrs}
        subline={across}
        icon={<PullRequestIcon />}
      />
      <StatCard
        label="PRs awaiting review"
        value={d.awaitingReview}
        subline="Review requested"
        icon={<CommentIcon />}
      />
      <StatCard
        label="Stale PRs"
        value={d.stale.length}
        subline="Review requested > 3 days ago"
        icon={<ClockIcon />}
        tone="warning"
      />
    </div>
  );
}

export function DashboardStatsSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-5">
      {[0, 1, 2, 3].map((i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}
