# 抽出ゴールデンデータセット

LLM 抽出 → graph 適用の **回帰テスト** 用フィクスチャ集。

## ねらい

LLM 出力は非決定的なため exact match では回帰テストできない。代わりに以下の二段戦略を取る:

1. **Tier 1 (CI で常時実行)**: LLM 呼び出しを **mock** し、固定の抽出結果 → `applyExtraction` → graph 状態の **構造的性質** を検証する。`tests/extraction-quality.test.ts` で実装。
2. **Tier 2 (任意・手動)**: 実 LLM を呼び出してフィクスチャの transcript を再抽出し、Tier 1 の golden 結果との差分を確認。プロンプト変更時の回帰検出に使う (本ディレクトリにスクリプト未整備、必要に応じて追加)。

## フィクスチャ形式

各フィクスチャは TypeScript ファイル (`*.fixture.ts`) として配置し、以下を export する:

```ts
export const transcript: string             // 元の議事録 (mock LLM への "入力" であり、人間用ドキュメント)
export const extraction: ExtractionResult   // LLM が返した想定の抽出結果 (golden output)
export const expectations: {
  // graph 適用後に検証する構造的性質
  minIssues: number, maxIssues: number      // ノード数の許容範囲
  minClaims: number, maxClaims: number
  minArguments: number, maxArguments: number
  minSubIssueOfEdges?: number               // sub-issue-of エッジが期待される件数下限
}
```

詳細は既存の `pubsub.fixture.ts` を参照。

## フィクスチャを追加するワークフロー

1. 候補となる議事録を `transcript` に貼る (実会議由来 or 合成)
2. 実 LLM (or 手動) で抽出を生成 → `extraction` に貼る
3. 構造的性質の許容範囲を `expectations` で設定
4. `npm test -- extraction-quality` でテストが通ることを確認
5. PR レビューで「これは妥当な抽出か」を人間が確認

## なぜこれが価値があるか

- **apply ロジックの回帰検出**: `src/io/applyExtraction.ts` のリファクタや `sub-issue-of` のような追加機能がフィクスチャを壊さないことを保証
- **プロンプト変更の検知**: 実 LLM で再抽出した結果が golden と乖離したらプロンプト調整の影響を即座に観察可能
- **抽出品質シグナルの自然な検証地点**: Phase 3-B で追加するシグナル (orphan_argument 等) もここで検出されるべきでない、と確認できる
