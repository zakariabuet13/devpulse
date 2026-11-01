// The one place the triage model and effort are chosen.
export const TRIAGE_CONFIG = {
  model: "claude-haiku-5-5",
  effort: "low",
  maxTokens: 1024,
  timeoutMs: 20_000,
} as const;
