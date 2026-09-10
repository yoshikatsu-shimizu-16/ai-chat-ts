# Active Improvement Rules

> Generated from verified observations. Do not edit manually.

- **separate-data-by-purpose** (client-state-and-api-boundaries): 表示用履歴、API送信用データ、生成中データを用途ごとに分離し、位置依存のマジックナンバーや暗黙のプレースホルダー契約を使わない。 [evidence: 1]
- **use-domain-specific-identifiers** (client-code-naming): 変数名・関数名にChatなどの対象ドメインと役割を含め、処理内容を名前から判断できるようにする。 [evidence: 1]
