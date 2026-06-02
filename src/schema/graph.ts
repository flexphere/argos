import { z } from "zod"
import { edgeSchema } from "./edges"
import {
  argumentNodeSchema,
  claimNodeSchema,
  criterionNodeSchema,
  issueNodeSchema,
  referenceNodeSchema,
} from "./nodes"
import { signalSchema } from "./signals"

export const CURRENT_SCHEMA_VERSION = "1.0"

export const graphAnalysisStateSchema = z.object({
  structural_version: z.number().int().nonnegative(),
  semantic_version: z.number().int().nonnegative().optional(),
  semantic_analyzed_at: z.string().optional(),
  is_semantic_stale: z.boolean(),
})
// GraphAnalysisState type alias は外部 import なし。Graph.analysis_state 経由でアクセス可能なため削除。

export const graphSchema = z.object({
  issues: z.array(issueNodeSchema),
  claims: z.array(claimNodeSchema),
  arguments: z.array(argumentNodeSchema),
  criteria: z.array(criterionNodeSchema),
  references: z.array(referenceNodeSchema),
  edges: z.array(edgeSchema),
  analysis_state: graphAnalysisStateSchema,
  semantic_signals: z.array(signalSchema).optional(),
})
export type Graph = z.infer<typeof graphSchema>

export const utteranceSchema = z.object({
  id: z.string(),
  speaker: z.string().optional(),
  text: z.string(),
  timestamp: z.string().optional(),
})
// Utterance type alias は外部 import なし。必要なら z.infer<typeof utteranceSchema> で取得。

export const transcriptSchema = z.object({
  utterances: z.array(utteranceSchema),
})
// Transcript type alias は外部 import なし (将来 transcript 処理を始めたら復活)。

export const exportSourceSchema = z.object({
  meeting_title: z.string().optional(),
  date: z.string().optional(),
  participants: z.array(z.string()).optional(),
})
// ExportSource type alias は外部 import なし。

export const exportRootSchema = z.object({
  $schema_version: z.string(),
  exported_at: z.string(),
  source: exportSourceSchema,
  include_transcript: z.boolean(),
  graph: graphSchema,
  transcript: transcriptSchema.optional(),
})
export type ExportRoot = z.infer<typeof exportRootSchema>
