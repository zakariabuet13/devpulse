// Shared by the paid-* scripts. USD per million tokens (<=100K-token prompts).
// Cache read = 0.1x input, 5m cache write = 1.25x input.
export type Rate = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export const RATES: Record<string, Rate> = {
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
  },
  "claude-sonnet-5-5": {
    input: 2,
    output: 10,
    cacheRead: 0.2,
    cacheWrite: 2.5,
  },
};

export type Usage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export const costOf = (u: Usage, r: Rate): number =>
  (u.input * r.input +
    u.output * r.output +
    u.cacheRead * r.cacheRead +
    u.cacheWrite * r.cacheWrite) /
  1_000_000;
