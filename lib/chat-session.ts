export type ChatSessionId = string;

/**
 * チャットセッションを識別する、推測困難な一時IDを生成する。
 * @returns 新しいチャットセッションID
 */
export function createChatSessionId(): ChatSessionId {
  return crypto.randomUUID();
}
