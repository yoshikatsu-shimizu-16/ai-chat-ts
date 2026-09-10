import { NextRequest } from "next/server";
import { z } from "zod";
import { createChatGraph, toLangChainMessages } from "@/lib/chat-graph";

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(request: NextRequest) {
  try {
    const body = requestSchema.parse(await request.json());
    const graph = createChatGraph();
    const stream = await graph.stream(
      { messages: toLangChainMessages(body.messages) },
      { streamMode: "messages" },
    );
    const encoder = new TextEncoder();
    const output = new ReadableStream({
      async start(controller) {
        try {
          for await (const [chunk] of stream) {
            const content =
              typeof chunk.content === "string" ? chunk.content : "";
            if (content) controller.enqueue(encoder.encode(content));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return new Response(output, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 502;
    return Response.json(
      {
        error:
          status === 400 ? "入力が不正です" : "AI応答を取得できませんでした",
      },
      { status },
    );
  }
}
