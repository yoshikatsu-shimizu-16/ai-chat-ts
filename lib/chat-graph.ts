import {
  HumanMessage,
  AIMessage,
  BaseMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import {
  Annotation,
  BaseCheckpointSaver,
  END,
  START,
  StateGraph,
  messagesStateReducer,
} from "@langchain/langgraph";

// APIから受け取る、ユーザーまたはAIの1件分のチャットメッセージ。
export type ChatInputMessage = { role: "user" | "assistant"; content: string };
// LangGraphが実行中に保持するチャット履歴の状態。
const State = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});

// AIモデルを呼び出してチャット応答を生成するグラフを構築する。
export function createChatGraph(checkpointer: BaseCheckpointSaver) {
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
      // グラフ状態には今回生成したAI回答だけを差分として返す。
      // 履歴全体を返すと streamMode: "messages" が過去のメッセージまで
      // 再送し、クライアントが今回の回答と誤認して表示してしまう。
      return { messages: [response] };
    })
    .addEdge(START, "chat_model")
    .addEdge("chat_model", END);
  
  return graph.compile({ checkpointer });
}

export function toLangChainMessages(messages: ChatInputMessage[]) {
  return messages.map((message) =>
    message.role === "user"
      ? new HumanMessage(message.content)
      : new AIMessage(message.content),
  );
}
