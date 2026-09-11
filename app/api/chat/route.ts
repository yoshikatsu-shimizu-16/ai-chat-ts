import { NextRequest } from "next/server";
import { z } from "zod";
import { clearChatSession, createChatStream } from "@/lib/chat-graph";
import { chatRequestSchema } from "@/lib/chat-request-schema";
import { createChatSessionId } from "@/lib/chat-session";

const CHAT_SESSION_COOKIE = "next-ai-chat.session";

/**
 * チャットセッションIDを安全なCookieヘッダー値へ変換する。
 * @param chatSessionId Cookieへ設定するチャットセッションID
 * @returns Set-Cookieヘッダー値
 */
function createChatSessionCookie(chatSessionId: string): string {
  return `${CHAT_SESSION_COOKIE}=${chatSessionId}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

/**
 * チャット入力を検証し、AI応答をHTTPストリームとして返す。
 *
 * @param request チャット履歴を含むHTTPリクエスト
 * @returns ストリーミング形式の成功レスポンス、またはエラーレスポンス
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = chatRequestSchema.parse(await request.json());
    const chatSessionId =
      request.cookies.get(CHAT_SESSION_COOKIE)?.value ?? createChatSessionId();
    const stream = createChatStream(chatSessionId, body.message);

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
    const response = new Response(output, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
    if (!request.cookies.has(CHAT_SESSION_COOKIE)) {
      response.headers.append(
        "set-cookie",
        createChatSessionCookie(chatSessionId),
      );
    }
    return response;
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

/**
 * 現在の匿名チャットセッションを破棄し、新しいセッションCookieを発行する。
 * @param request 現在のチャットセッションCookieを含むHTTPリクエスト
 * @returns 新しいセッションCookieを含む204レスポンス
 */
export function DELETE(request: NextRequest): Response {
  const currentChatSessionId = request.cookies.get(CHAT_SESSION_COOKIE)?.value;
  if (currentChatSessionId) {
    void clearChatSession(currentChatSessionId);
  }
  const nextChatSessionId = createChatSessionId();
  const response = new Response(null, { status: 204 });
  response.headers.set(
    "set-cookie",
    createChatSessionCookie(nextChatSessionId),
  );
  return response;
}
