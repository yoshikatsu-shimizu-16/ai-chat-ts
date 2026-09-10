import {
  HumanMessage,
  AIMessage,
  BaseMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

export type ChatInputMessage = { role: "user" | "assistant"; content: string };
const State = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (_old, next) => next,
    default: () => [],
  }),
});

// 🔵 Intent: LangGraphの最小構成を明示し、後からノードを追加できる学習用の境界にする。
export function createChatGraph() {
  const model = new ChatOpenAI({
    model: process.env.OPENAI_API_MODEL ?? "gpt-4.1-nano",
    temperature: Number(process.env.OPENAI_API_TEMPERATURE ?? "0.5"),
    streaming: true,
  });
  const graph = new StateGraph(State)
    .addNode("chat_model", async (state) => {
      const response = await model.invoke([
        new SystemMessage("あなたは親切で簡潔な日本語アシスタントです。"),
        ...state.messages,
      ]);
      return { messages: [...state.messages, response] };
    })
    .addEdge(START, "chat_model")
    .addEdge("chat_model", END);
  return graph.compile();
}

export function toLangChainMessages(messages: ChatInputMessage[]) {
  return messages.map((message) =>
    message.role === "user"
      ? new HumanMessage(message.content)
      : new AIMessage(message.content),
  );
}
