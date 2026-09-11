import { describe, expect, it } from "vitest";
import { chatRequestSchema } from "@/lib/chat-request-schema";

describe("chat request contract", () => {
  it("accepts a user message", () =>
    expect(chatRequestSchema.parse({ message: "こんにちは" }).message).toBe(
      "こんにちは",
    ));
  it("rejects empty content", () =>
    expect(() => chatRequestSchema.parse({ message: " " })).toThrow());
  it("rejects a client-provided history", () =>
    expect(() =>
      chatRequestSchema.parse({ message: "続き", messages: [] }),
    ).toThrow());
});
