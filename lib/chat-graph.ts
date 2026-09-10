import {
  HumanMessage,
  AIMessage,
  BaseMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

// APIから受け取る、ユーザーまたはAIの1件分のチャットメッセージ。
export type ChatInputMessage = { role: "user" | "assistant"; content: string };
// LangGraphが実行中に保持するチャット履歴の状態。
const State = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (_old, next) => next,
    default: () => [],
  }),
});

// コンパイル済みグラフは共有し、実行ストリームだけをリクエストごとに作る。
const chatGraph = createChatGraph();

/**
 * 会話履歴をAI応答の文字列ストリームへ変換する。
 *
 * @param messages 画面から受け取った会話履歴
 * @returns 今回生成されたAI応答だけを返す非同期文字列ストリーム
 */
export async function* createChatStream(
  messages: ChatInputMessage[],
): AsyncGenerator<string, void, undefined> {
  // AIモデルを呼び出すチャットグラフを実行し、ストリームで応答を受け取る。
  const graphStream = await chatGraph.stream(
    // LangGraphの状態に、画面から受け取った会話履歴を渡す。
    {
      messages: toLangChainMessages(messages),
    },
    // LangGraphのストリームモードを「messages」に設定することで、
    // chat_modelノードの出力であるBaseMessage[]を1件ずつ受け取れる。
    {
      streamMode: "messages",
    },
  );

  // LangGraphのストリームから、回答の文字列だけを取り出して返す。
  for await (const [chunk] of graphStream) {
    const content = typeof chunk.content === "string" ? chunk.content : "";
    if (content) yield content;
  }
}

/**
 * AIモデルを呼び出すチャットグラフを構築してコンパイルする。
 *
 * @returns 再利用可能なコンパイル済みチャットグラフ
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

  return graph.compile();
}

/**
 * 画面入力をLangChainのメッセージ形式へ変換する。
 *
 * @param messages 画面から受け取った会話履歴
 * @returns LangChainへ渡すメッセージ一覧
 */
function toLangChainMessages(messages: ChatInputMessage[]): BaseMessage[] {
  return messages.map((message) =>
    message.role === "user"
      ? new HumanMessage(message.content)
      : new AIMessage(message.content),
  );
}
