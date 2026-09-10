"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };
const CHAT_HISTORY_STORAGE_KEY = "next-ai-chat.messages";

export default function Chat() {
  // チャットとAI回答を含む、確定済みの会話履歴を管理する。
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  // 入力フィールドの状態を管理する。
  const [chatInputText, setChatInputText] = useState("");
  // ストリーミング中のAI回答は履歴と分離して表示する。
  const [chatStreamingAssistantReply, setChatStreamingAssistantReply] = useState("");
  // AI回答の生成中かどうかを管理する。
  const [isChatResponseLoading, setIsChatResponseLoading] = useState(false);
  // 実行中のチャットAPIリクエストを中断するためのコントローラーを保持する。
  const chatResponseAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // マウント後にsessionStorageから保存済みのチャット履歴を復元する。
    const storedChatHistoryJson = sessionStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
    if (storedChatHistoryJson) {
      // Session storage is restored after hydration; a lazy initializer would render different server and client HTML.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChatHistory(JSON.parse(storedChatHistoryJson) as ChatMessage[]);
    }
  }, []);

  useEffect(() => {
    // 確定済みのチャット履歴だけをsessionStorageへ保存する。
    sessionStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(chatHistory));
  }, [chatHistory]);

  async function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    // フォームのデフォルト送信をキャンセルし、チャットAPIを呼び出す。
    event.preventDefault();
    const trimmedChatInputText = chatInputText.trim();
    if (!trimmedChatInputText || isChatResponseLoading) return;

    // API送信用のチャットメッセージと、画面表示中の回答を別々に扱う。
    const chatUserMessage: ChatMessage = { role: "user", content: trimmedChatInputText };
    const chatHistoryWithNextUserMessage = [...chatHistory, chatUserMessage];
    setChatHistory(chatHistoryWithNextUserMessage);
    setChatInputText("");
    setChatStreamingAssistantReply("");
    setIsChatResponseLoading(true);

    const chatResponseAbortController = new AbortController();
    chatResponseAbortControllerRef.current = chatResponseAbortController;
    let completeChatAssistantReply = "";

    try {
      // チャットAPIへ、確定済み履歴と今回のユーザー入力だけを送信する。
      const chatResponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: chatHistoryWithNextUserMessage }),
        signal: chatResponseAbortController.signal,
      });
      if (!chatResponse.ok || !chatResponse.body) throw new Error("応答を取得できませんでした");

      const chatResponseReader = chatResponse.body.getReader();
      const chatResponseDecoder = new TextDecoder();
      while (true) {
        const { value, done } = await chatResponseReader.read();
        if (done) break;
        completeChatAssistantReply += chatResponseDecoder.decode(value, { stream: true });
        setChatStreamingAssistantReply(completeChatAssistantReply);
      }
      setChatHistory((currentChatHistory) => [
        ...currentChatHistory,
        { role: "assistant", content: completeChatAssistantReply },
      ]);
      setChatStreamingAssistantReply("");
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setChatHistory((currentChatHistory) => [
          ...currentChatHistory,
          { role: "assistant", content: "エラーが発生しました。もう一度試してください。" },
        ]);
        setChatStreamingAssistantReply("");
      }
    } finally {
      chatResponseAbortControllerRef.current = null;
      setIsChatResponseLoading(false);
    }
  }

  function clearChatHistory() {
    // 実行中のチャット要求を中断し、履歴と保存データを消去する。
    chatResponseAbortControllerRef.current?.abort();
    setChatHistory([]);
    setChatStreamingAssistantReply("");
    sessionStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
  }

  const hasChatMessages = chatHistory.length > 0 || chatStreamingAssistantReply.length > 0;

  return (
    <section className="chat">
      <div className="messages" aria-live="polite">
        {!hasChatMessages && <p className="empty">質問を入力してください。</p>}
        {chatHistory.map((chatMessage, index) => (
          <article className={`message ${chatMessage.role}`} key={`${index}-${chatMessage.role}`}>
            <span>{chatMessage.role === "user" ? "あなた" : "AI"}</span>
            <p>{chatMessage.content}</p>
          </article>
        ))}
        {isChatResponseLoading && (
          <article className="message assistant">
            <span>AI</span>
            <p>{chatStreamingAssistantReply || "考え中…"}</p>
          </article>
        )}
      </div>
      <form onSubmit={handleChatSubmit}>
        <textarea
          value={chatInputText}
          onChange={(event) => setChatInputText(event.target.value)}
          placeholder="メッセージを入力"
          maxLength={4000}
          disabled={isChatResponseLoading}
          aria-label="メッセージ"
        />
        <div className="actions">
          <button type="submit" disabled={isChatResponseLoading || !chatInputText.trim()}>送信</button>
          {isChatResponseLoading && (
            <button type="button" onClick={() => chatResponseAbortControllerRef.current?.abort()}>停止</button>
          )}
          <button type="button" className="secondary" onClick={clearChatHistory}>新しい会話</button>
        </div>
      </form>
    </section>
  );
}
