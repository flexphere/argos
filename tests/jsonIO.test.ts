import { describe, expect, it } from "vitest"
import { buildExportRoot, defaultFilename, parseImportJson } from "../src/io/jsonIO"
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

describe("parseImportJson", () => {
  it("$schema_version があれば export 形式として扱う", () => {
    const root = buildExportRoot(emptyGraph)
    const result = parseImportJson(JSON.stringify(root))
    expect(result.kind).toBe("export")
    if (result.kind !== "export") throw new Error("unreachable")
    expect(result.data.$schema_version).toBe(CURRENT_SCHEMA_VERSION)
  })

  it("issues 配列があれば fixture 形式として扱う", () => {
    const fixture = {
      issues: [{ ref: "issue-1", text: "採用する DB は？" }],
      claims: [{ ref: "claim-1", text: "PostgreSQL", addresses: "issue-1" }],
      arguments: [],
    }
    const result = parseImportJson(JSON.stringify(fixture))
    expect(result.kind).toBe("fixture")
    if (result.kind !== "fixture") throw new Error("unreachable")
    expect(result.data.issues).toHaveLength(1)
    expect(result.data.semantic).toBeUndefined()
  })

  it("semantic が壊れていても抽出結果だけは取り込む", () => {
    const fixture = {
      issues: [{ ref: "issue-1", text: "問い" }],
      claims: [],
      arguments: [],
      semantic: { driftFindings: "配列ではない" },
    }
    const result = parseImportJson(JSON.stringify(fixture))
    expect(result.kind).toBe("fixture")
    if (result.kind !== "fixture") throw new Error("unreachable")
    expect(result.data.issues).toHaveLength(1)
    expect(result.data.semantic).toBeUndefined()
  })

  it("どちらの形式でもない JSON は例外を投げる", () => {
    expect(() => parseImportJson(JSON.stringify({ foo: "bar" }))).toThrow()
  })

  it("JSON として不正なら例外を投げる", () => {
    expect(() => parseImportJson("{ not json")).toThrow()
  })

  it("エスケープされた < を含む fixture も復元できる", () => {
    // 埋め込み HTML 経由で来るデータは escapeForScriptTag を通っている。
    // JSON としては \u003c なので、parse すれば < に戻る。
    const escaped =
      '{"issues":[{"ref":"i1","text":"\\u003c/script\\u003e"}],"claims":[],"arguments":[]}'
    const result = parseImportJson(escaped)
    if (result.kind !== "fixture") throw new Error("unreachable")
    expect(result.data.issues[0].text).toBe("</script>")
  })
})
