import { NextRequest } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { env } from "cloudflare:workers";
import { createChatGraph, toLangChainMessages } from "@/lib/chat-graph";
import { D1Checkpointer } from "@/lib/d1-checkpointer";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});

export async function POST(request: NextRequest) {
  try {
    const body = requestSchema.parse(await request.json());
    const requestCookies = await cookies();
    const savedThreadId = requestCookies.get("chat_thread_id")?.value;
    const isUuid = savedThreadId && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(savedThreadId);
    const threadId = isUuid ? savedThreadId : crypto.randomUUID();
    const graph = createChatGraph(new D1Checkpointer(env.DB));
    const stream = await graph.stream(
      { messages: toLangChainMessages([{ role: "user", content: body.message }]) },
      { configurable: { thread_id: threadId }, streamMode: "messages" },
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
        "set-cookie": `chat_thread_id=${threadId}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000`,
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
