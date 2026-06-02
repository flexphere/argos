import { z } from "zod"

export const confidenceSchema = z.enum(["strong", "moderate", "weak"])
export type Confidence = z.infer<typeof confidenceSchema>

export const claimStatusSchema = z.enum(["agreed", "rejected", "unresolved", "out-of-scope"])
export type ClaimStatus = z.infer<typeof claimStatusSchema>

export const issueStatusSchema = z.enum(["open", "resolved", "deferred"])
export type IssueStatus = z.infer<typeof issueStatusSchema>

export const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
})
export type Position = z.infer<typeof positionSchema>

// ADR-0008: 旧 evidenceRefSchema は  `cites` (Argument → Reference) で
// 役割が置き換わったため削除。Argument.data は string[] に簡素化された。

export const issueNodeSchema = z.object({
  id: z.string(),
  text: z.string(),
  status: issueStatusSchema,
  position: positionSchema.optional(),
  source_utterance_id: z.string().optional(),
  created_at: z.string().optional(),
  author: z.string().optional(),
})
export type IssueNode = z.infer<typeof issueNodeSchema>

export const claimNodeSchema = z.object({
  id: z.string(),
  text: z.string(),
  status: claimStatusSchema,
  confidence: confidenceSchema,
  support_count: z.number().int().nonnegative(),
  attack_count: z.number().int().nonnegative(),
  unanswered_attacks: z.number().int().nonnegative(),
  position: positionSchema.optional(),
  source_utterance_id: z.string().optional(),
  created_at: z.string().optional(),
  author: z.string().optional(),
})
export type ClaimNode = z.infer<typeof claimNodeSchema>

/**
 * Argument の接続先見直し候補。
 * semantic-analyze (改善提案) が「この Argument は別の Claim を pro/con した方が
 * 自然」と判定したときに付与される。ユーザーが [付け替える] [却下] で消える。
 */
export const argumentMisplacementSuggestionSchema = z.object({
  candidate_claim_id: z.string(),
  candidate_kind: z.enum(["supports", "attacks"]),
  reason: z.string(),
})
// ArgumentMisplacementSuggestion type alias は外部 import なし。
// Argument.misplacement_suggestion 経由でアクセスされる。

export const argumentNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(["pro", "con"]),
  scope: z.enum(["general", "exception"]).optional(),
  data: z.array(z.string()),
  misplacement_suggestion: argumentMisplacementSuggestionSchema.optional(),
  position: positionSchema.optional(),
  source_utterance_id: z.string().optional(),
  created_at: z.string().optional(),
  author: z.string().optional(),
})
export type ArgumentNode = z.infer<typeof argumentNodeSchema>

export const criterionNodeSchema = z.object({
  id: z.string(),
  text: z.string(),
  weight: confidenceSchema.optional(),
  position: positionSchema.optional(),
  source_utterance_id: z.string().optional(),
})
export type CriterionNode = z.infer<typeof criterionNodeSchema>

export const referenceNodeSchema = z.object({
  id: z.string(),
  uri: z.string().optional(),
  title: z.string(),
  excerpt: z.string().optional(),
  position: positionSchema.optional(),
})
export type ReferenceNode = z.infer<typeof referenceNodeSchema>
