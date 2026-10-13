import { labelTone, type LabelTone } from "@/lib/boardLogic";

const TONE: Record<LabelTone, string> = {
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  neutral: "bg-zinc-100 text-zinc-600",
};

export function LabelChip({ label }: { label: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] leading-3 ${TONE[labelTone(label)]}`}>
      {label}
    </span>
  );
}
