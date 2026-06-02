import { z } from "zod"

export const edgeKindSchema = z.enum([
  "addresses",
  "supports",
  "attacks",
  "evaluates-by",
  "cites",
  "sub-issue-of",
  // Claim ↔ Claim の排他関係。同一 Issue を addressing する Claim 同士でのみ有効。
  // Canonical 方向は from = ref 辞書順小さい方 (重複防止のため)。意味的には対称。
  "alternative-to",
])
export type EdgeKind = z.infer<typeof edgeKindSchema>

export const edgeSchema = z.object({
  id: z.string(),
  kind: edgeKindSchema,
  from: z.string(),
  to: z.string(),
})
export type Edge = z.infer<typeof edgeSchema>
