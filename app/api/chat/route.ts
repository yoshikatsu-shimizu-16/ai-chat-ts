import { NextRequest } from "next/server";
import { z } from "zod";
import { createChatStream } from "@/lib/chat-graph";

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

/**
 * チャット入力を検証し、AI応答をHTTPストリームとして返す。
 *
 * @param request チャット履歴を含むHTTPリクエスト
 * @returns ストリーミング形式の成功レスポンス、またはエラーレスポンス
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = requestSchema.parse(await request.json());
    const stream = createChatStream(body.messages);

    const encoder = new TextEncoder();
    const output = new ReadableStream<Uint8Array>({
      async start(controller): Promise<void> {
        try {
          // サービスの文字列ストリームをHTTPのバイト列へ変換する。
          for await (const content of stream) {
            controller.enqueue(encoder.encode(content));
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
