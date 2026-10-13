"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDownIcon, UsersIcon } from "./icons";

type Props = { teams: { id: string; name: string }[]; selectedId: string };

export function TeamSelect({ teams, selectedId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Stay on the current page and keep its other params (e.g. `view`).
  function selectTeam(id: string) {
    const params = new URLSearchParams(searchParams);
    params.set("team", id);
    router.push(`${pathname}?${params}`);
  }

  return (
    <label className="relative flex h-[58px] w-[276px] items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 shadow-sm">
      <UsersIcon className="shrink-0 text-zinc-700" />
      <span className="flex flex-col">
        <span className="font-mono text-[10px] uppercase leading-3 text-zinc-500">Team</span>
        <span className="text-[15px] font-semibold text-zinc-900">
          {teams.find((t) => t.id === selectedId)?.name}
        </span>
      </span>
      <ChevronDownIcon className="ml-auto text-zinc-700" width={16} height={16} />
      <select
        aria-label="Team"
        value={selectedId}
        onChange={(e) => selectTeam(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
