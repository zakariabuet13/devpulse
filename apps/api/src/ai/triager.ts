export interface Triager {
  // `unknown` on purpose: the route re-validates with triageResultSchema, so no
  // implementation (or test fake) is trusted to be well-typed.
  triage(input: { title: string; body: string | null }): Promise<unknown>;
}

// Deliberately generic: never carries the key, an upstream body or raw model text.
export class TriageError extends Error {
  constructor(message = "AI triage failed") {
    super(message);
    this.name = "TriageError";
  }
}
