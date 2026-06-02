import { z } from "zod"

/**
 * 抽出出力のドメインスキーマ。
 *
 * - 内部の UUID ではなく、人間可読な ref（"issue-1" など）でノード間関係を表す
 * - 後処理（io/applyExtraction）で実際の graph store の UUID に変換する
 * - skill 側で agent が in-context 生成した JSON を `scripts/save-fixture.ts` が
 *   このスキーマで検証する
 */

export const extractedIssueSchema = z.object({
  ref: z.string().describe("一意な参照 ID（例: issue-1）"),
  text: z.string().describe("議題の本文。問いの形が望ましい"),
  parent_ref: z
    .string()
    .nullable()
    .optional()
    .describe(
      "親 Issue の ref。論理的従属関係（親の結論が出なければ子が無意味）がある場合のみ指定。無ければ省略または null。see",
    ),
})

export const extractedClaimSchema = z.object({
  ref: z.string().describe("一意な参照 ID（例: claim-1）"),
  text: z.string().describe("主張の本文"),
  addresses: z.string().nullable().describe("この主張が扱う Issue の ref（無ければ null）"),
})

export const extractedArgumentSchema = z.object({
  ref: z.string().describe("一意な参照 ID（例: arg-1）"),
  kind: z.enum(["pro", "con"]),
  data: z.string().describe("根拠となる事実・データ"),
  targets: z.string().describe("支持/反論する対象の Claim ref（必須）"),
  evaluates_by: z
    .array(z.string())
    .optional()
    .describe("この論証が依拠する Criterion の ref 配列。確信がなければ省略"),
  cites: z
    .array(z.string())
    .optional()
    .describe("この論証が引用する Reference の ref 配列。確信がなければ省略"),
})

/**
 * 評価軸。
 * 議論内で複数の Claim を比較する際の観点として明示的に使われた概念のみ。
 */
export const extractedCriterionSchema = z.object({
  ref: z.string().describe("一意な参照 ID (例: criterion-1)"),
  text: z.string().describe("評価軸の名称 (例: コスト / 保守性 / 納期影響)"),
  weight: z
    .enum(["strong", "moderate", "weak"])
    .optional()
    .describe("重要度。議事録で明示されていれば付与、無ければ省略"),
})

/**
 * 参照。
 * 議論内で事実主張 / 外部参照として持ち出されたものを記録する。
 */
export const extractedReferenceSchema = z.object({
  ref: z.string().describe("一意な参照 ID (例: reference-1)"),
  title: z.string().describe("参照先の短い名称 (例: '他社事例', '公式ドキュメント')"),
  uri: z.string().optional().describe("URL があれば付与"),
  excerpt: z.string().optional().describe("抜粋・補足説明"),
})

/**
 * Claim 間の排他関係。
 * 同じ Issue を addressing している Claim 同士で、両立不可能と明らかに読み取れる
 * 場合のみ LLM が出力する。確信が無ければ省略。
 *
 * 順序は意味的に対称だが、重複防止のため apply 時に canonical 化 (ref 辞書順) する。
 */
export const claimRelationSchema = z.object({
  ref_a: z.string().describe("代替関係にある Claim の ref (片方)"),
  ref_b: z.string().describe("代替関係にある Claim の ref (もう一方)"),
})

export const extractionResultSchema = z.object({
  issues: z.array(extractedIssueSchema),
  claims: z.array(extractedClaimSchema),
  arguments: z.array(extractedArgumentSchema),
  claim_relations: z
    .array(claimRelationSchema)
    .optional()
    .describe(
      "Claim 間の排他 (alternative-to) 関係。同じ Issue を addressing する Claim 同士で両立不可能な場合のみ。",
    ),
  criteria: z
    .array(extractedCriterionSchema)
    .optional()
    .describe("評価軸。Argument.evaluates_by から参照される"),
  references: z
    .array(extractedReferenceSchema)
    .optional()
    .describe("参照。Argument.cites から参照される"),
})

export type ExtractionResult = z.infer<typeof extractionResultSchema>
export type ExtractedIssue = z.infer<typeof extractedIssueSchema>
// ExtractedClaim / ExtractedArgument / ClaimRelation / ExtractedCriterion /
// ExtractedReference の type alias は外部 import 無し。必要なら z.infer で取得可能。
