import type { AssistantEvent, ChatMessage } from "@devpulse/shared";

export interface Assistant {
  // Yields tool/text/done; failures THROW (the route turns them into one `error` line).
  chat(
    messages: ChatMessage[],
    opts: { signal: AbortSignal },
  ): AsyncIterable<AssistantEvent>;
}

// Deliberately generic: never carries the key, an upstream body or raw model text.
export class AssistantError extends Error {
  constructor(message = "Assistant failed") {
    super(message);
    this.name = "AssistantError";
  }
}
