"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };
const STORAGE_KEY = "next-ai-chat.messages";

export default function Chat() {
  // チャットメッセージの状態を管理するためのuseStateフックを使用
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  // 入力フィールドの状態を管理するためのuseStateフックを使用
  const [inputPrompt, setInputPrompt] = useState("");
  // ローディング状態を管理するためのuseStateフックを使用
  const [loading, setLoading] = useState(false);

  // 中断コントローラーを管理するためのuseRefフックを使用
  const abortRef = useRef<AbortController | null>(null);

  // コンポーネントがマウントされたときに、セッションストレージから保存されたメッセージを取得して状態に設定
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    // Session storage is restored after hydration; a lazy initializer would render different server and client HTML.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setChatMessages(JSON.parse(saved) as ChatMessage[]);
  }, // 
  [] // 空の依存配列を指定することで、コンポーネントの初回レンダリング時のみ実行
  );

  // チャットメッセージが更新されるたびに、セッションストレージに保存
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(chatMessages));
  }, // 
  [chatMessages] // chatMessagesが更新されるたびに実行
  );

  /**
   * フォームの送信処理
   * 
   * @param event フォーム送信イベント
   */
  async function submit(event: FormEvent<HTMLFormElement>) {
    // フォームのデフォルトの送信動作をキャンセル
    event.preventDefault();

    // 入力内容をトリムして空でないか確認し、ローディング中でない場合のみ処理を続行
    const content = inputPrompt.trim();
    if (!content || loading) return;
    
    // 新しいユーザーメッセージと空のアシスタントメッセージを追加して、次のチャットメッセージの配列を作成
    const nextChatMessages = [
      ...chatMessages, // 既存のチャットメッセージをコピー
      { role: "user" as const, content },
      { role: "assistant" as const, content: "" },
    ];

    // チャットメッセージの状態を更新し、入力フィールドをクリアしてローディング状態を設定
    setChatMessages(nextChatMessages);
    setInputPrompt("");
    setLoading(true);

    // 新しいAbortControllerを作成して、abortRefに保存
    const controller = new AbortController();
    abortRef.current = controller;

    // APIにPOSTリクエストを送信して、チャットの応答を取得
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: nextChatMessages.slice(0, -1) }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body)
        throw new Error("応答を取得できませんでした");
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        setChatMessages((current) =>
          current.map((message, index) =>
            index === current.length - 1
              ? { ...message, content: message.content + text }
              : message,
          ),
        );
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError")
        setChatMessages((current) =>
          current.map((message, index) =>
            index === current.length - 1
              ? {
                  ...message,
                  content: "エラーが発生しました。もう一度試してください。",
                }
              : message,
          ),
        );
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  function clear() {
    abortRef.current?.abort();
    setChatMessages([]);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  return (
    <section className="chat">
      <div className="messages" aria-live="polite">
        {chatMessages.length === 0 && (
          <p className="empty">質問を入力してください。</p>
        )}
        {chatMessages.map((message, index) => (
          <article
            className={`message ${message.role}`}
            key={`${index}-${message.role}`}
          >
            <span>{message.role === "user" ? "あなた" : "AI"}</span>
            <p>
              {message.content ||
                (loading && index === chatMessages.length - 1 ? "考え中…" : "")}
            </p>
          </article>
        ))}
      </div>
      <form onSubmit={submit}>
        <textarea
          value={inputPrompt}
          onChange={(event) => setInputPrompt(event.target.value)}
          placeholder="メッセージを入力"
          maxLength={4000}
          disabled={loading}
          aria-label="メッセージ"
        />
        <div className="actions">
          <button type="submit" disabled={loading || !inputPrompt.trim()}>
            送信
          </button>
          {loading && (
            <button type="button" onClick={() => abortRef.current?.abort()}>
              停止
            </button>
          )}
          <button type="button" className="secondary" onClick={clear}>
            新しい会話
          </button>
        </div>
      </form>
    </section>
  );
}
