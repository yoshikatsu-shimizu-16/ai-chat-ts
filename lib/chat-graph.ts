import {
  HumanMessage,
  BaseMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import {
  Annotation,
  END,
  MemorySaver,
  START,
  StateGraph,
} from "@langchain/langgraph";
import type { ChatSessionId } from "@/lib/chat-session";

const MAX_CHAT_MEMORY_MESSAGES = 20;
const chatMemorySaver = new MemorySaver();
// Annotation: LangGraphの共有状態。
const State = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    // 現在の履歴に今回のメッセージを追加し、最新20件を残す。
    reducer: (currentChatMessages, chatMessagesToAppend) =>
      [...currentChatMessages, ...chatMessagesToAppend].slice(
        -MAX_CHAT_MEMORY_MESSAGES,
      ),
    // default: 状態がない場合の初期値。
    default: () => [],
  }),
});

// コンパイル済みグラフは共有し、実行ストリームだけをリクエストごとに作る。
const chatGraph = createChatGraph();

/**
 * サーバー側のチャットメモリーを使ってAI応答の文字列ストリームを生成する。
 *
 * @param chatSessionId Cookieで識別されたチャットセッションID
 * @param chatUserMessage 今回のユーザー入力
 * @returns 今回生成されたAI応答だけを返す非同期文字列ストリーム
 */
export async function* createChatStream(
  chatSessionId: ChatSessionId,
  chatUserMessage: string,
): AsyncGenerator<string, void, undefined> {
  // AIモデルを呼び出すチャットグラフを実行し、ストリームで応答を受け取る。
  const graphStream = await chatGraph.stream(
    // LangGraphには今回の入力だけを渡し、過去の状態はthread_idから復元する。
    { messages: [new HumanMessage(chatUserMessage)] },
    // LangGraphのストリームモードを「messages」に設定することで、
    // chat_modelノードの出力であるBaseMessage[]を1件ずつ受け取れる。
    {
      streamMode: "messages",
      configurable: { thread_id: chatSessionId },
    },
  );

  // LangGraphのストリームから、回答の文字列だけを取り出して返す。
  for await (const [chunk] of graphStream) {
    const content = typeof chunk.content === "string" ? chunk.content : "";
    if (content) yield content;
  }
}

/**
 * チャットモデルを呼び出し、チェックポイント付きのグラフを構築する。
 * @returns コンパイル済みチャットグラフ
 */
function createChatGraph() {
  // モデル、温度、ストリーミング設定を環境変数から決める。
  const model = new ChatOpenAI({
    model: process.env.OPENAI_API_MODEL ?? "gpt-4.1-nano",
    temperature: Number(process.env.OPENAI_API_TEMPERATURE ?? "0.5"),
    streaming: true,
  });
  // 入力履歴をAIモデルへ渡し、chat_modelノードで回答を生成する。
  // state.messagesには過去のユーザー発言とAI回答が含まれるため、
  // ここで履歴を渡すことは、会話の文脈を維持するために必要である。
  const graph = new StateGraph(State)
    .addNode("chat_model", async (state) => {
      const response = await model.invoke([
        new SystemMessage("あなたは親切で簡潔な日本語アシスタントです。"),
        ...state.messages,
      ]);
      // 履歴はモデルの文脈に使うが、出力は今回の回答だけに限定する。
      return { messages: [response] };
    })
    .addEdge(START, "chat_model")
    .addEdge("chat_model", END);

  return graph.compile({ checkpointer: chatMemorySaver });
}

/**
 * 指定されたチャットセッションのサーバー側メモリーを完全に削除する。
 * @param chatSessionId 削除対象のチャットセッションID
 * @returns メモリー削除完了を示すPromise
 */
export async function clearChatSession(
  chatSessionId: ChatSessionId,
): Promise<void> {
  await chatMemorySaver.deleteThread(chatSessionId);
}
