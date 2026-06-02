import { describe, expect, it } from "vitest"
import { buildExportRoot, defaultFilename } from "../src/io/jsonIO"
import { CURRENT_SCHEMA_VERSION, type Graph, exportRootSchema } from "../src/schema"

const emptyGraph: Graph = {
  issues: [],
  claims: [],
  arguments: [],
  criteria: [],
  references: [],
  edges: [],
  analysis_state: { structural_version: 0, is_semantic_stale: false },
}

describe("buildExportRoot", () => {
  it("wraps a graph with the current schema version", () => {
    const root = buildExportRoot(emptyGraph)
    expect(root.$schema_version).toBe(CURRENT_SCHEMA_VERSION)
    expect(root.graph).toBe(emptyGraph)
  })

  it("sets exported_at to a valid ISO string", () => {
    const root = buildExportRoot(emptyGraph)
    expect(() => new Date(root.exported_at).toISOString()).not.toThrow()
    expect(root.exported_at).toBe(new Date(root.exported_at).toISOString())
  })

  it("defaults include_transcript to false", () => {
    const root = buildExportRoot(emptyGraph)
    expect(root.include_transcript).toBe(false)
  })

  it("respects include_transcript option", () => {
    const root = buildExportRoot(emptyGraph, { includeTranscript: true })
    expect(root.include_transcript).toBe(true)
  })

  it("passes meeting metadata through to source field", () => {
    const root = buildExportRoot(emptyGraph, {
      meetingTitle: "kickoff",
      meetingDate: "2026-05-21",
      participants: ["山田", "鈴木"],
    })
    expect(root.source.meeting_title).toBe("kickoff")
    expect(root.source.date).toBe("2026-05-21")
    expect(root.source.participants).toEqual(["山田", "鈴木"])
  })

  it("output validates against exportRootSchema", () => {
    const root = buildExportRoot(emptyGraph, { meetingTitle: "x" })
    const result = exportRootSchema.safeParse(root)
    expect(result.success).toBe(true)
  })
})

describe("defaultFilename", () => {
  it("matches the expected pattern", () => {
    const name = defaultFilename()
    expect(name).toMatch(/^argos-\d{8}-\d{4}\.json$/)
  })
})
