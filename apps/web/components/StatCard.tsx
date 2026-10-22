import type { ReactNode } from "react";

type Props = {
  label: string;
  value: number;
  subline: string;
  icon: ReactNode;
  tone?: "warning";
};

export function StatCard({ label, value, subline, icon, tone }: Props) {
  const warn = tone === "warning";
  return (
    <div
      className={`rounded-lg border p-5 ${
        warn
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-zinc-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between text-sm">
        <span className={warn ? "text-amber-800" : "text-zinc-700"}>
          {label}
        </span>
        <span className={warn ? "text-amber-700" : "text-zinc-500"}>
          {icon}
        </span>
      </div>
      <div
        className={`mt-3 text-4xl font-semibold ${warn ? "text-amber-800" : "text-zinc-900"}`}
      >
        {value}
      </div>
      <div
        className={`mt-4 font-mono text-[10px] ${warn ? "text-amber-700" : "text-zinc-500"}`}
      >
        {subline}
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="h-[146px] animate-pulse rounded-lg border border-zinc-200 bg-zinc-100" />
  );
}
