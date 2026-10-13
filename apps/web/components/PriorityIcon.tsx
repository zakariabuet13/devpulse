import type { Priority } from "@devpulse/shared";

// 3 bars: LOW fills 1, MEDIUM 2, HIGH and URGENT all 3 (amber / red).
const FILLED: Record<Priority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 3 };
const TONE: Record<Priority, string> = {
  LOW: "text-zinc-500",
  MEDIUM: "text-zinc-700",
  HIGH: "text-amber-600",
  URGENT: "text-red-600",
};

export function PriorityIcon({ priority, size = 14 }: { priority: Priority; size?: number }) {
  const filled = FILLED[priority];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      className={`shrink-0 ${TONE[priority]}`}
      aria-hidden="true"
    >
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={1 + i * 4.5}
          y={9 - i * 3.5}
          width="3"
          height={4 + i * 3.5}
          rx="0.75"
          fill="currentColor"
          opacity={i < filled ? 1 : 0.25}
        />
      ))}
    </svg>
  );
}
