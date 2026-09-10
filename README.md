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

モデルなどの実行設定は、Cloudflare Dashboardの対象Worker（`ai-chat-ts`）を開き、
「Settings」→「Variables and Secrets」から通常のVariablesとして登録します。

```text
OPENAI_API_MODEL=gpt-4.1-nano
OPENAI_API_TEMPERATURE=0.5
```

## 学習ポイント

- `lib/chat-graph.ts`: `START → chat_model → END` のLangGraph
- `app/api/chat/route.ts`: LangGraphのトークンをWeb Streamへ変換
- `app/chat.tsx`: `sessionStorage` と `AbortController` を使うチャットUI

本番公開時は、認証、レート制限、入力モデレーション、ログ方針を追加してください。

### 会話履歴の永続化（D1）

Cloudflare Workersはリクエスト間でメモリを共有しないため、LangGraphのチェックポイントをD1へ保存します。初回だけデータベースを作成し、`wrangler.jsonc` の `database_id` を発行されたIDに置き換えてください。

```bash
wrangler d1 migrations apply ai-chat-ts --remote
```

APIはブラウザへ `chat_thread_id` Cookieを発行し、その値をLangGraphの `thread_id` として利用します。次回リクエストではクライアントから履歴を送らず、D1チェックポインターが同じスレッドの状態を復元します。ローカルの `sessionStorage` は画面表示用キャッシュであり、AIへ渡す履歴の正本ではありません。

## 開発AIの改善ループ

このワークスペースでは、Codexへの繰り返し修正を匿名化して記録し、別ターンで2回確認され、品質ゲートに合格したルールだけを次回以降の指示へ自動昇格します。モデルを再学習する仕組みではなく、プロジェクト固有のコンテキストと評価基準を継続的に改善する仕組みです。

```bash
pnpm loop:status
pnpm loop:record -- --source user-correction --session-id SESSION --turn-id TURN \
  --scope tests --summary "検証契約をテストへ複製した" \
  --desired-behavior "テストは本番コードが公開する契約を利用する" \
  --fingerprint tests-use-production-contract --evidence-ref test/example.spec.ts
pnpm loop:promote
```

状態は `.improvement-loop/`、手順は `.agents/skills/code-improvement-loop/`、自動化設定は `.codex/hooks.json` にあります。新しいCodexセッションで `/hooks` を開き、プロジェクトフックを確認して信頼してください。
