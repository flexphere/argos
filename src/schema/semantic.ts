import { z } from "zod"

/**
 * 意味分析 (改善提案) の結果スキーマ。
 *
 * フィールド内の *Ref は ExtractionResult.ref ベース (人間可読 ID)。skill 側で
 * agent が in-context 生成した JSON を `scripts/save-fixture.ts` がこのスキーマで
 * 検証し、ExtractionResult と結合して保存する。ブラウザ側で fixture を読むときは
 * applyExtraction が返す ref→UUID マップで再マップしてから適用する。
 */
export const semanticAnalysisSchema = z.object({
  driftFindings: z
    .array(
      z.object({
        claimRef: z.string().describe("対象 Claim の id"),
        issueRef: z.string().describe("Claim が addresses している Issue の id"),
        relevance: z
          .number()
          .min(0)
          .max(1)
          .describe("Claim と Issue の関連度（0=無関係, 1=完全に関連）"),
        reason: z.string().describe("なぜそう判断したか1〜2文で"),
      }),
    )
    .describe("relevance < 0.5 の Claim だけを含める"),
  // Argument 接続先ミスマッチ。テストや既存呼び出しでは空配列を必須で渡す。
  misplacementFindings: z
    .array(
      z.object({
        argumentRef: z.string().describe("対象 Argument の id"),
        candidateClaimRef: z.string().describe("付け替え候補の Claim id"),
        candidateKind: z
          .enum(["supports", "attacks"])
          .describe("候補 Claim に対する pro/con のどちらが自然か"),
        reason: z.string().describe("なぜ候補の方が自然か 1〜2 文で"),
      }),
    )
    .describe(
      "Argument の内容が現在の target Claim より、候補 Claim に対してより自然に pro/con できる場合のみ含める。自信が無ければ空配列。",
    ),
})

export type SemanticAnalysisResult = z.infer<typeof semanticAnalysisSchema>
