import { describe, expect, it } from "vitest"
import { CURRENT_SCHEMA_VERSION, type ExportRoot, exportRootSchema } from "../src/schema"

const sampleExport: ExportRoot = {
  $schema_version: CURRENT_SCHEMA_VERSION,
  exported_at: "2026-05-21T10:00:00Z",
  source: {
    meeting_title: "サンプル会議",
    date: "2026-05-21",
    participants: ["山田", "鈴木"],
  },
  include_transcript: false,
  graph: {
    issues: [
      {
        id: "i1",
        text: "新ツールを採用すべきか?",
        status: "open",
      },
    ],
    claims: [
      {
        id: "c1",
        text: "採用する",
        status: "unresolved",
        confidence: "moderate",
        support_count: 1,
        attack_count: 1,
        unanswered_attacks: 1,
      },
    ],
    arguments: [
      {
        id: "a1",
        kind: "pro",
        data: ["コストが半減する"],
      },
      {
        id: "a2",
        kind: "con",
        data: ["学習コストが高い"],
      },
    ],
    criteria: [{ id: "cr1", text: "コスト" }],
    references: [],
    edges: [
      { id: "e1", kind: "addresses", from: "c1", to: "i1" },
      { id: "e2", kind: "supports", from: "a1", to: "c1" },
      { id: "e3", kind: "attacks", from: "a2", to: "c1" },
      { id: "e4", kind: "evaluates-by", from: "a1", to: "cr1" },
    ],
    analysis_state: {
      structural_version: 4,
      is_semantic_stale: true,
    },
  },
}

describe("schema validation", () => {
  it("accepts a valid export root", () => {
    const result = exportRootSchema.safeParse(sampleExport)
    expect(result.success).toBe(true)
  })

  it("rejects an export root missing schema version", () => {
    const { $schema_version: _, ...invalid } = sampleExport
    const result = exportRootSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("rejects a claim with negative support_count", () => {
    const invalid: ExportRoot = JSON.parse(JSON.stringify(sampleExport))
    invalid.graph.claims[0].support_count = -1
    const result = exportRootSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })
})

describe("JSON round-trip", () => {
  it("preserves data through serialize → parse → validate", () => {
    const json = JSON.stringify(sampleExport)
    const parsed = JSON.parse(json)
    const result = exportRootSchema.safeParse(parsed)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(sampleExport)
      const reJson = JSON.stringify(result.data)
      expect(JSON.parse(reJson)).toEqual(sampleExport)
    }
  })
})
