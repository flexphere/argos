import type { ExtractionResult } from "../../../src/schema/extraction"

/**
 * フィクスチャ (ADR-0007): DB 選定議論で Criterion / Reference を明示的に含むケース。
 *
 * 期待される構造:
 *   I1: 新サービスの DB に何を採用すべきか
 *     ├─ C1: Postgres を採用
 *     │   ├─ A1 (pro): 既存運用ノウハウがある (evaluates_by: 運用コスト)
 *     │   └─ A2 (pro): jsonb があるので柔軟性も担保 (cites: 公式ドキュメント)
 *     └─ C2: DynamoDB を採用
 *         └─ A3 (con): 周辺チームでは Postgres が標準 (cites: 他チーム事例)
 *
 *   Criterion:
 *     - cr-1: 運用コスト
 *     - cr-2: 柔軟性 (スキーマ進化)
 *
 *   References:
 *     - rf-1: Postgres jsonb 公式ドキュメント
 *     - rf-2: 他チーム標準の事例
 */

const transcript = `
A: 新サービスの DB に何を採用するか相談したい。
B: Postgres にしよう。運用コストの観点で既存のノウハウがあるので新規学習コストが低い。
C: Postgres の jsonb は柔軟性 (スキーマ進化) もそこそこ担保できる。公式ドキュメントにも追加カラム不要での schema 変更のパターンが書いてある。
A: 一方で DynamoDB も検討すべきだと思う。スケール特性は強い。
B: でも周辺チームでは Postgres が標準だよ。横展開がしやすい。
C: 結論として、運用コストと柔軟性を重視するなら Postgres でよさそう。
`.trim()

const extraction: ExtractionResult = {
  issues: [{ ref: "i-1", text: "新サービスの DB に何を採用すべきか" }],
  claims: [
    { ref: "c-postgres", text: "Postgres を採用", addresses: "i-1" },
    { ref: "c-dynamo", text: "DynamoDB を採用", addresses: "i-1" },
  ],
  arguments: [
    {
      ref: "a-pg-1",
      kind: "pro",
      data: "既存運用ノウハウがあり新規学習コストが低い",
      targets: "c-postgres",
      evaluates_by: ["cr-1"],
    },
    {
      ref: "a-pg-2",
      kind: "pro",
      data: "jsonb で追加カラム不要でのスキーマ進化が可能",
      targets: "c-postgres",
      evaluates_by: ["cr-2"],
      cites: ["rf-1"],
    },
    {
      ref: "a-dynamo-1",
      kind: "con",
      data: "周辺チームでは Postgres が標準なので横展開しづらい",
      targets: "c-dynamo",
      cites: ["rf-2"],
    },
  ],
  claim_relations: [{ ref_a: "c-postgres", ref_b: "c-dynamo" }],
  criteria: [
    { ref: "cr-1", text: "運用コスト" },
    { ref: "cr-2", text: "柔軟性 (スキーマ進化)" },
  ],
  references: [
    { ref: "rf-1", title: "Postgres jsonb 公式ドキュメント" },
    { ref: "rf-2", title: "他チーム標準の事例" },
  ],
}

const expectations = {
  minIssues: 1,
  maxIssues: 1,
  minClaims: 2,
  maxClaims: 2,
  minArguments: 3,
  maxArguments: 3,
  minSubIssueOfEdges: 0,
  minAltToEdges: 1,
  minCriteria: 2,
  minReferences: 2,
  minEvaluatesByEdges: 2,
  minCitesEdges: 2,
}

export default { transcript, extraction, expectations }
