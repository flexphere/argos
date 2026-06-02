import { describe, expect, it } from "vitest"
import { graphToMarkdown } from "../src/io/markdown"
import type { Graph } from "../src/schema"

const emptyGraph: Graph = {
  issues: [],
  claims: [],
  arguments: [],
  criteria: [],
  references: [],
  edges: [],
  analysis_state: { structural_version: 0, is_semantic_stale: false },
}

describe("graphToMarkdown", () => {
  it("starts with header", () => {
    const md = graphToMarkdown(emptyGraph, { meetingTitle: "kickoff" })
    expect(md).toMatch(/^# 議論: kickoff/)
  })

  it("includes meeting metadata when provided", () => {
    const md = graphToMarkdown(emptyGraph, {
      meetingTitle: "x",
      date: "2026-05-21",
      participants: ["山田", "鈴木"],
    })
    expect(md).toContain("**日時**: 2026-05-21")
    expect(md).toContain("**参加者**: 山田, 鈴木")
  })

  it("contains summary counts", () => {
    const md = graphToMarkdown(emptyGraph)
    expect(md).toContain("議題: 0 件")
    expect(md).toContain("主張: 0 件")
  })

  it("embeds mermaid block", () => {
    const md = graphToMarkdown(emptyGraph)
    expect(md).toMatch(/```mermaid\ngraph TD/)
    // mermaid block must be closed
    const open = (md.match(/```mermaid/g) ?? []).length
    const close = (md.match(/^```$/gm) ?? []).length
    expect(open).toBe(1)
    expect(close).toBe(1)
  })

  it("renders issue with addressing claims and arguments", () => {
    const md = graphToMarkdown({
      ...emptyGraph,
      issues: [{ id: "i1", text: "採用?", status: "open" }],
      claims: [
        {
          id: "c1",
          text: "採用する",
          status: "unresolved",
          confidence: "moderate",
          support_count: 0,
          attack_count: 0,
          unanswered_attacks: 0,
        },
      ],
      arguments: [
        {
          id: "a1",
          kind: "pro",
          data: ["コスト削減"],
        },
        {
          id: "a2",
          kind: "con",
          data: ["学習負荷"],
        },
      ],
      edges: [
        { id: "e1", kind: "addresses", from: "c1", to: "i1" },
        { id: "e2", kind: "supports", from: "a1", to: "c1" },
        { id: "e3", kind: "attacks", from: "a2", to: "c1" },
      ],
    })
    expect(md).toContain("### 採用?")
    expect(md).toContain("採用する")
    expect(md).toContain("**Pro**: コスト削減")
    expect(md).toContain("**Con**: 学習負荷")
  })

  it("includes 考慮漏れ section when applicable", () => {
    const md = graphToMarkdown({
      ...emptyGraph,
      claims: [
        {
          id: "c1",
          text: "x",
          status: "unresolved",
          confidence: "moderate",
          support_count: 0,
          attack_count: 1,
          unanswered_attacks: 1,
        },
      ],
      arguments: [
        {
          id: "a1",
          kind: "con",
          data: [],
        },
      ],
    })
    expect(md).toContain("## 考慮漏れ一覧")
    expect(md).toContain("未根拠の主張: 1 件")
    expect(md).toContain("未応答の反論: 1 件")
  })
})
