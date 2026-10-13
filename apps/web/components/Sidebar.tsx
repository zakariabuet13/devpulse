import type { ReactNode } from "react";
import {
  DashboardIcon,
  FolderIcon,
  HelpIcon,
  IssueIcon,
  PullRequestIcon,
  SettingsIcon,
} from "./icons";
import { NavLink } from "./NavLink";

// Routes don't exist yet.
function Item({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span
      className="flex h-10 cursor-not-allowed items-center gap-2.5 rounded-md px-3 text-[13px] text-zinc-600"
      aria-disabled="true"
    >
      {icon}
      {label}
    </span>
  );
}

export function Sidebar() {
  return (
    <aside className="flex w-[200px] shrink-0 flex-col justify-between border-r border-zinc-200 bg-white px-3.5 pb-4 pt-[30px]">
      <nav className="flex flex-col gap-1">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wide text-zinc-400">
          Workspace
        </div>
        <NavLink href="/" icon={<DashboardIcon />} label="Team Health" />
        <NavLink href="/issues" icon={<IssueIcon />} label="Issues" />
        <Item icon={<PullRequestIcon />} label="Pull Requests" />
        <Item icon={<FolderIcon />} label="Repositories" />
      </nav>
      <div className="flex flex-col gap-1">
        <Item icon={<SettingsIcon />} label="Settings" />
        <Item icon={<HelpIcon />} label="Help & feedback" />
      </div>
    </aside>
  );
}
