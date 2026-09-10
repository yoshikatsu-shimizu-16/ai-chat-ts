# next-ai-chat

Next.js / TypeScript / LangChain.js / LangGraph.jsで作る学習用AIチャットです。

## セットアップ

```bash
pnpm install
cp .env.example .env.local
# .env.local に OPENAI_API_KEY を設定
pnpm dev
```

ブラウザで `http://localhost:3000` を開きます。

## Cloudflare Workers

```bash
pnpm cf:build
pnpm cf:deploy
```

本番のAPIキーはWrangler Secretへ登録します。

```bash
wrangler secret put OPENAI_API_KEY
```

## 学習ポイント

- `lib/chat-graph.ts`: `START → chat_model → END` のLangGraph
- `app/api/chat/route.ts`: LangGraphのトークンをWeb Streamへ変換
- `app/chat.tsx`: `sessionStorage` と `AbortController` を使うチャットUI

本番公開時は、認証、レート制限、入力モデレーション、ログ方針を追加してください。
