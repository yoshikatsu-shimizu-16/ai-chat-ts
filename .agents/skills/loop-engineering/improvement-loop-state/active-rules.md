# Active Improvement Rules

> Generated from verified observations. Do not edit manually.

- **separate-data-by-purpose** (client-state-and-api-boundaries): 表示用履歴、API送信用データ、生成中データを用途ごとに分離し、位置依存のマジックナンバーや暗黙のプレースホルダー契約を使わない。 [evidence: 1]
- **use-domain-specific-identifiers** (client-code-naming): 変数名・関数名にChatなどの対象ドメインと役割を含め、処理内容を名前から判断できるようにする。 [evidence: 2]
- **explain-causal-source-locations** (debugging-and-review): 不具合や設計問題を説明するときは、関連するファイルパス・行番号・データの流れを具体的に示し、原因箇所と症状が現れる箇所を区別する。 [evidence: 1]
- **document-functions-with-jsdoc** (source-documentation): 公開関数と主要な内部関数には目的、引数、戻り値を示すJSDocを付ける [evidence: 3]
