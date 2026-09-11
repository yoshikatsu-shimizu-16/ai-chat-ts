import { describe, expect, it } from "vitest";
import { chatRequestSchema } from "@/lib/chat-request-schema";
import { createChatSessionId } from "@/lib/chat-session";

describe("chat memory request contract", () => {
  it("accepts only the next user message", () => {
    expect(chatRequestSchema.parse({ message: "こんにちは" })).toEqual({
      message: "こんにちは",
    });
  });

  it("rejects a client-provided history", () => {
    expect(() =>
      chatRequestSchema.parse({
        message: "続きです",
        messages: [{ role: "user", content: "過去の会話" }],
      }),
    ).toThrow();
  });

  it("creates opaque session identifiers", () => {
    const chatSessionId = createChatSessionId();
    expect(chatSessionId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
