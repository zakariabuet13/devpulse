"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BoardIcon, ListIcon } from "./icons";

export type IssueView = "board" | "list";

type Props = { view: IssueView; teamId: string };

export function ViewToggle({ view, teamId }: Props) {
  const team = `team=${encodeURIComponent(teamId)}`;
  const item = (v: IssueView, href: string, icon: ReactNode, label: string) => (
    <Link
      href={href}
      scroll={false}
      aria-current={view === v ? "page" : undefined}
      className={`flex h-[30px] items-center gap-1.5 rounded px-2 text-[13px] ${
        view === v ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
  return (
    <nav aria-label="View" className="flex h-9 items-center rounded-md bg-zinc-100 p-[3px]">
      {item("board", `?${team}`, <BoardIcon width={15} height={15} />, "Board")}
      {item("list", `?${team}&view=list`, <ListIcon width={15} height={15} />, "List")}
    </nav>
  );
}
