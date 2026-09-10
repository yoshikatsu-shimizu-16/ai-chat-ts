import { describe, expect, it } from "vitest";
import { z } from "zod";

const schema = z.object({ message: z.string().trim().min(1).max(4000) });

describe("chat request contract", () => {
  it("accepts one user message", () => expect(schema.parse({ message: "こんにちは" }).message).toBe("こんにちは"));
  it("rejects empty content", () => expect(() => schema.parse({ message: " " })).toThrow());
  it("rejects a history payload", () => expect(() => schema.parse({ messages: [{ role: "user", content: "こんにちは" }] })).toThrow());
});
