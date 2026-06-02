import { describe, expect, it } from "vitest"
import type { Graph } from "../src/schema"
import {
  detectDisconnectedCriteria,
  detectDisconnectedReferences,
  detectExtractionQualitySignals,
  detectOrphanArguments,
  detectUnreachableIssues,
} from "../src/signals/extractionQuality"

const empty: Graph = {
  issues: [],
  claims: [],
  arguments: [],
  criteria: [],
  references: [],
  edges: [],
  analysis_state: { structural_version: 0, is_semantic_stale: false },
}

describe("detectOrphanArguments", () => {
  it("supports/attacks エッジを持たない Argument を検出する", () => {
    const g: Graph = {
      ...empty,
      arguments: [
        {
          id: "a-orphan",
          kind: "pro",
          data: ["x"],
        },
        {
          id: "a-connected",
          kind: "pro",
          data: ["y"],
        },
      ],
      claims: [
        {
          id: "c1",
          text: "C",
          status: "unresolved",
          confidence: "moderate",
          support_count: 0,
          attack_count: 0,
          unanswered_attacks: 0,
        },
      ],
      edges: [{ id: "e1", kind: "supports", from: "a-connected", to: "c1" }],
    }
    const signals = detectOrphanArguments(g)
    expect(signals).toHaveLength(1)
    expect(signals[0].kind).toBe("orphan_argument")
    expect(signals[0].affected_node_ids).toEqual(["a-orphan"])
  })

  it("supports/attacks のどちらかを持つ Argument は検出しない", () => {
    const g: Graph = {
      ...empty,
      arguments: [
        {
          id: "a-pro",
          kind: "pro",
          data: ["x"],
        },
        {
          id: "a-con",
          kind: "con",
          data: ["y"],
        },
      ],
      claims: [
        {
          id: "c1",
          text: "C",
          status: "unresolved",
          confidence: "moderate",
          support_count: 0,
          attack_count: 0,
          unanswered_attacks: 0,
        },
      ],
      edges: [
        { id: "e1", kind: "supports", from: "a-pro", to: "c1" },
        { id: "e2", kind: "attacks", from: "a-con", to: "c1" },
      ],
    }
    expect(detectOrphanArguments(g)).toHaveLength(0)
  })
})

describe("detectUnreachableIssues", () => {
  it("どの Claim も addresses していない Issue を検出する", () => {
    const g: Graph = {
      ...empty,
      issues: [
        { id: "i-orphan", text: "誰も話さない議題", status: "open" },
        { id: "i-addressed", text: "話されている議題", status: "open" },
      ],
      claims: [
        {
          id: "c1",
          text: "C",
          status: "unresolved",
          confidence: "moderate",
          support_count: 0,
          attack_count: 0,
          unanswered_attacks: 0,
        },
      ],
      edges: [{ id: "e1", kind: "addresses", from: "c1", to: "i-addressed" }],
    }
    const signals = detectUnreachableIssues(g)
    expect(signals.map((s) => s.affected_node_ids[0])).toEqual(["i-orphan"])
  })

  it("sub-issue-of だけ持っていて Claim が無い Issue も検出する (議論が起きていない)", () => {
    const g: Graph = {
      ...empty,
      issues: [
        { id: "i-parent", text: "親", status: "open" },
        { id: "i-sub", text: "子だが Claim 無し", status: "open" },
      ],
      edges: [{ id: "e1", kind: "sub-issue-of", from: "i-sub", to: "i-parent" }],
    }
    const ids = detectUnreachableIssues(g).map((s) => s.affected_node_ids[0])
    expect(ids).toContain("i-parent")
    expect(ids).toContain("i-sub")
  })
})

describe("detectDisconnectedCriteria", () => {
  it("evaluates-by エッジを持たない Criterion を検出する", () => {
    const g: Graph = {
      ...empty,
      criteria: [
        { id: "cr-used", text: "コスト" },
        { id: "cr-orphan", text: "誰も使わない基準" },
      ],
      claims: [
        {
          id: "c1",
          text: "C",
          status: "unresolved",
          confidence: "moderate",
          support_count: 0,
          attack_count: 0,
          unanswered_attacks: 0,
        },
      ],
      edges: [{ id: "e1", kind: "evaluates-by", from: "c1", to: "cr-used" }],
    }
    const signals = detectDisconnectedCriteria(g)
    expect(signals.map((s) => s.affected_node_ids[0])).toEqual(["cr-orphan"])
  })
})

describe("detectDisconnectedReferences", () => {
  it("cites エッジを持たない Reference を検出する", () => {
    const g: Graph = {
      ...empty,
      references: [
        { id: "r-used", title: "資料 A" },
        { id: "r-orphan", title: "誰も引用しない資料" },
      ],
      claims: [
        {
          id: "c1",
          text: "C",
          status: "unresolved",
          confidence: "moderate",
          support_count: 0,
          attack_count: 0,
          unanswered_attacks: 0,
        },
      ],
      edges: [{ id: "e1", kind: "cites", from: "c1", to: "r-used" }],
    }
    const signals = detectDisconnectedReferences(g)
    expect(signals.map((s) => s.affected_node_ids[0])).toEqual(["r-orphan"])
  })
})

describe("detectExtractionQualitySignals (集約)", () => {
  it("全種別をまとめて返す", () => {
    const g: Graph = {
      ...empty,
      issues: [{ id: "i", text: "誰も議論しない", status: "open" }],
      arguments: [
        {
          id: "a",
          kind: "pro",
          data: ["x"],
        },
      ],
      criteria: [{ id: "cr", text: "使われない基準" }],
      references: [{ id: "r", title: "未引用" }],
    }
    const signals = detectExtractionQualitySignals(g)
    const kinds = signals.map((s) => s.kind).sort()
    expect(kinds).toEqual([
      "disconnected_criterion",
      "disconnected_reference",
      "orphan_argument",
      "unreachable_issue",
    ])
  })
})
