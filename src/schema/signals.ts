import { z } from "zod"

export const signalKindSchema = z.enum([
  "unanswered_attack",
  "unsupported_claim",
  "criterion_mismatch",
  "semantic_drift",
  "term_inconsistency",
  // ── 抽出品質シグナル ────────────────
  // LLM 抽出が不完全だった場合に検出される。Graph データの欠落を示す
  "orphan_argument", // どの Claim にも supports/attacks していない Argument
  "unreachable_issue", // どの Claim からも addresses されていない Issue
  "disconnected_criterion", // どの Claim も評価していない Criterion
  "disconnected_reference", // どの node も引用していない Reference
  // ── alternative-to 制約 ──────────────────────
  // 同時 agreed 矛盾: alternative-to で繋がる Claim が両方 agreed のセーフティネット
  "agreed_alternatives_conflict",
  // ── Argument 接続先ミスマッチ ────────────────
  // semantic 経路で「この Argument は別 Claim を pro/con した方が自然」と判定
  "misplaced_argument",
  // ── 意思決定支援 (argumentation-quality 課題 6) ─────────
  // 「もう agreed に昇格しても良さそう」をポジティブにガイドする構造 signal
  "ready_to_agree",
])
export type SignalKind = z.infer<typeof signalKindSchema>

export const signalSchema = z.object({
  kind: signalKindSchema,
  affected_node_ids: z.array(z.string()),
  computed_at: z.string(),
  source: z.enum(["structural", "semantic"]),
})
export type Signal = z.infer<typeof signalSchema>
