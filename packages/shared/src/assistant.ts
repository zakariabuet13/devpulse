import { z } from "zod";

export const MAX_QUESTION_CHARS = 2000;
export const MAX_HISTORY_TURNS = 5;
const MAX_ANSWER_CHARS = 8000;
// 5 past turns (user + assistant each) + the new question.
const MAX_MESSAGES = MAX_HISTORY_TURNS * 2 + 1;

export const chatMessageSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("user"),
    content: z.string().max(MAX_QUESTION_CHARS),
  }),
  z.object({
    role: z.literal("assistant"),
    content: z.string().max(MAX_ANSWER_CHARS),
  }),
]);

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatRequestSchema = z.object({
  messages: z
    .array(chatMessageSchema)
    .min(1)
    .max(MAX_MESSAGES)
    .refine((m) => m[m.length - 1]?.role === "user", {
      message: "The last message must be from the user",
    }),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const assistantEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tool"), name: z.string() }),
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type AssistantEvent = z.infer<typeof assistantEventSchema>;
