"use client";

import { useState, useTransition } from "react";
import type { Member, Team } from "@devpulse/shared";
import { moveMember } from "@/app/members/actions";
import { Avatar } from "./Avatar";

type Props = { members: Member[]; teams: Team[] };

export function MemberList({ members, teams }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [, startTransition] = useTransition();

  function setPending(id: string, pending: boolean) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function move(id: string, teamId: string) {
    if (!teamId) return;
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPending(id, true);
    startTransition(async () => {
      const result = await moveMember(id, teamId);
      if (!result.ok) setErrors((prev) => ({ ...prev, [id]: result.error }));
      setPending(id, false);
    });
  }

  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">
        No members found.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
      {members.map((m) => {
        const pending = pendingIds.has(m.id);
        const error = errors[m.id];
        return (
          <li key={m.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center gap-3">
              <Avatar name={m.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium text-zinc-900">{m.name}</div>
                <div className="truncate font-mono text-[12px] text-zinc-500">@{m.githubLogin}</div>
              </div>
              <select
                aria-label={`Move ${m.name} to team`}
                value=""
                disabled={pending}
                onChange={(e) => move(m.id, e.target.value)}
                className="h-9 w-[200px] cursor-pointer rounded-md border border-zinc-200 bg-white px-2 text-[13px] text-zinc-700 outline-none focus:border-zinc-400 disabled:cursor-wait disabled:opacity-60"
              >
                <option value="">{pending ? "Moving…" : "Move to team…"}</option>
                {teams
                  .filter((t) => t.id !== m.teamId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>
            {error && (
              <p
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-[13px] text-red-800"
              >
                {error}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
