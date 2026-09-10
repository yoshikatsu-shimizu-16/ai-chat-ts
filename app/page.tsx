import Chat from "./chat";

export default function Home() {
  return (
    <main>
      <header>
        <p className="eyebrow">学習用デモ</p>
        <h1>AIチャット</h1>
        <p>Next.js・LangChain・LangGraphを使ったシンプルな対話デモです。</p>
      </header>
      <Chat />
    </main>
  );
}
