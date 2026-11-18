/* eslint-disable @typescript-eslint/no-explicit-any */
export type Summary = {
  subtype?: string;
  turns?: number;
  costUsd?: number;
  modelUsage: Record<string, any>;
  toolCalls: Record<string, number>;
  permissionDenials: unknown[];
};

// Messages are loosely typed on purpose: also fed from recorded JSONL.
export function summarize(messages: any[]): Summary {
  const s: Summary = { modelUsage: {}, toolCalls: {}, permissionDenials: [] };
  const seenBlocks = new Set<string>();
  for (const m of messages) {
    if (m.type === "assistant") {
      for (const b of m.message?.content ?? []) {
        if (b.type !== "tool_use" || seenBlocks.has(b.id)) continue;
        seenBlocks.add(b.id);
        s.toolCalls[b.name] = (s.toolCalls[b.name] ?? 0) + 1;
      }
    } else if (m.type === "result") {
      s.subtype = m.subtype;
      s.turns = m.num_turns;
      s.costUsd = m.total_cost_usd;
      s.modelUsage = m.modelUsage ?? {};
      s.permissionDenials = m.permission_denials ?? [];
    }
  }
  return s;
}
