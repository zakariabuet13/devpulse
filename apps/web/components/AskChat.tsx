"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MAX_HISTORY_TURNS,
  MAX_QUESTION_CHARS,
  type ChatMessage,
} from "@devpulse/shared";
import { parseEvent, splitLines } from "@/lib/ndjson";

const GENERIC_ERROR = "Something went wrong. Please try again.";

// Reads the API's error body for 400/503; anything unexpected falls back to a generic message.
async function failureMessage(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === "string") return error;
  if (Array.isArray(error)) {
    return error
      .map((i: { message?: string }) => i.message ?? "Invalid input")
      .join("; ");
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return GENERIC_ERROR;
}

export function AskChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Closing the page mid-answer aborts the request, which aborts the Claude call.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;

    // Stateless API: send the last 5 turns plus the new question.
    const history = messages.slice(-MAX_HISTORY_TURNS * 2);
    const outgoing: ChatMessage[] = [
      ...history,
      { role: "user", content: question },
    ];
    setMessages([...messages, { role: "user", content: question }]);
    setInput("");
    setError(null);
    setTool(null);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let answer = "";
    const showAnswer = () =>
      setMessages([
        ...messages,
        { role: "user", content: question },
        { role: "assistant", content: answer },
      ]);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: outgoing }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        setError(res.ok ? GENERIC_ERROR : await failureMessage(res));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let carry = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const split = splitLines(
          carry,
          decoder.decode(value, { stream: true }),
        );
        carry = split.rest;
        for (const line of split.lines) {
          const event = parseEvent(line);
          if (!event) continue;
          if (event.type === "tool") setTool(event.name);
          else if (event.type === "text") {
            setTool(null);
            answer += event.text;
            showAnswer();
          } else if (event.type === "error") setError(event.message);
        }
      }
    } catch {
      if (!controller.signal.aborted) setError(GENERIC_ERROR);
    } finally {
      setTool(null);
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex min-h-64 flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4">
        {messages.length === 0 && (
          <p className="text-[13px] text-zinc-500">
            Ask about teams, issues, pull requests or stats. For example: which
            pull requests have waited on review for more than 3 days?
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "self-end rounded-md bg-zinc-100 px-3 py-2 text-[13px] text-zinc-900"
                : "self-start text-[13px] text-zinc-800"
            }
          >
            {/* Plain text only: model output is never rendered as HTML. */}
            <span className="whitespace-pre-wrap">{m.content}</span>
          </div>
        ))}
        {busy && tool && (
          <p className="text-[13px] italic text-zinc-500" aria-live="polite">
            Looking up…
          </p>
        )}
        {error && (
          <p className="text-[13px] text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>

      <form onSubmit={send} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={MAX_QUESTION_CHARS}
          placeholder="Ask DevPulse…"
          aria-label="Your question"
          className="h-10 flex-1 rounded-md border border-zinc-200 bg-white px-3 text-[13px] outline-none focus:border-zinc-400"
        />
        <button
          type="submit"
          disabled={busy || input.trim() === ""}
          className="h-10 rounded-md bg-zinc-900 px-4 text-[13px] text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Asking…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
