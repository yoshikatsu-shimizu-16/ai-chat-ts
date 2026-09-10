import { describe, expect, it } from "vitest";
import { z } from "zod";

const schema = z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) })).min(1).max(20) });

describe("chat request contract", () => {
  it("accepts a user message", () => expect(schema.parse({ messages: [{ role: "user", content: "こんにちは" }] }).messages).toHaveLength(1));
  it("rejects empty content", () => expect(() => schema.parse({ messages: [{ role: "user", content: " " }] })).toThrow());
  it("rejects more than 20 messages", () => expect(() => schema.parse({ messages: Array.from({ length: 21 }, () => ({ role: "user", content: "x" })) })).toThrow());
});
