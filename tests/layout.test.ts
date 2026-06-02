import { describe, expect, it } from "vitest"
import { computeLayout } from "../src/graph/layout"
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

describe("computeLayout", () => {
  it("returns empty map for empty graph", () => {
    expect(computeLayout(emptyGraph).size).toBe(0)
  })

  it("places Issue at top, Claim in middle, Argument at bottom (y order)", () => {
    const g: Graph = {
      ...emptyGraph,
      issues: [{ id: "i1", text: "I", status: "open" }],
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
      arguments: [
        {
          id: "a1",
          kind: "pro",
          data: [],
        },
      ],
      edges: [
        { id: "e1", kind: "addresses", from: "c1", to: "i1" },
        { id: "e2", kind: "supports", from: "a1", to: "c1" },
      ],
    }
    const p = computeLayout(g)
    const iy = p.get("i1")?.y ?? 0
    const cy = p.get("c1")?.y ?? 0
    const ay = p.get("a1")?.y ?? 0
    expect(iy).toBeLessThan(cy)
    expect(cy).toBeLessThan(ay)
  })

  it("Issue subtree は常に 1 行に並ぶ (行ラップ廃止 B 案)", () => {
    const g: Graph = {
      ...emptyGraph,
      issues: [
        { id: "i1", text: "I1", status: "open" },
        { id: "i2", text: "I2", status: "open" },
        { id: "i3", text: "I3", status: "open" },
      ],
    }
    const p = computeLayout(g)
    const y1 = p.get("i1")?.y ?? 0
    const y2 = p.get("i2")?.y ?? 0
    const y3 = p.get("i3")?.y ?? 0
    // 全 Issue が同じ Y (= 同じ行)
    expect(y1).toBe(y2)
    expect(y2).toBe(y3)
    // X は左→右に並ぶ
    const x1 = p.get("i1")?.x ?? 0
    const x2 = p.get("i2")?.x ?? 0
    const x3 = p.get("i3")?.x ?? 0
    expect(x2).toBeGreaterThan(x1)
    expect(x3).toBeGreaterThan(x2)
  })

  it("orphan claim (no addresses) は Issue subtree と重ならない位置に置かれる", () => {
    const g: Graph = {
      ...emptyGraph,
      issues: [{ id: "i1", text: "I1", status: "open" }],
      claims: [
        {
          id: "c-orphan",
          text: "orphan",
          status: "unresolved",
          confidence: "moderate",
          support_count: 0,
          attack_count: 0,
          unanswered_attacks: 0,
        },
      ],
    }
    const p = computeLayout(g)
    const issuePos = p.get("i1")
    const orphanPos = p.get("c-orphan")
    expect(issuePos).toBeTruthy()
    expect(orphanPos).toBeTruthy()
    // 同じ行に置かれていれば X が違うはず、別の行なら Y が違うはず
    const overlaps = issuePos?.x === orphanPos?.x && issuePos?.y === orphanPos?.y
    expect(overlaps).toBe(false)
  })

  it("evaluates-by / cites で繋がった Criterion / Reference は Claim の直下に配置される", () => {
    const g: Graph = {
      ...emptyGraph,
      issues: [{ id: "i1", text: "I1", status: "open" }],
      claims: [
        {
          id: "c1",
          text: "C1",
          status: "unresolved",
          confidence: "moderate",
          support_count: 0,
          attack_count: 0,
          unanswered_attacks: 0,
        },
      ],
      criteria: [{ id: "cr1", text: "コスト" }],
      references: [{ id: "ref1", title: "doc" }],
      edges: [
        { id: "e1", kind: "addresses", from: "c1", to: "i1" },
        { id: "e2", kind: "evaluates-by", from: "c1", to: "cr1" },
        { id: "e3", kind: "cites", from: "c1", to: "ref1" },
      ],
    }
    const p = computeLayout(g)
    const claimY = p.get("c1")?.y ?? 0
    const criY = p.get("cr1")?.y ?? 0
    const refY = p.get("ref1")?.y ?? 0
    // Claim の 1 layer 下に Criterion / Reference が来る
    expect(criY - claimY).toBe(200)
    expect(refY - claimY).toBe(200)
    // 同じ depth なので Y は等しい
    expect(criY).toBe(refY)
  })

  it("sub-issue-of の子 issue は親 issue の下に置かれる（横並びにはならない）", () => {
    const g: Graph = {
      ...emptyGraph,
      issues: [
        { id: "parent", text: "親", status: "open" },
        { id: "sub", text: "子", status: "open" },
      ],
      edges: [{ id: "e1", kind: "sub-issue-of", from: "sub", to: "parent" }],
    }
    const p = computeLayout(g)
    const parentY = p.get("parent")?.y ?? 0
    const subY = p.get("sub")?.y ?? 0
    expect(subY).toBeGreaterThan(parentY)
    expect(subY - parentY).toBeGreaterThanOrEqual(200)
  })

  it("sub-issue は親 Issue の下、Claim の sibling として配置される（同じ depth）", () => {
    // 親 Issue
    //   ├── sub-issue
    //   └── Claim
    const g: Graph = {
      ...emptyGraph,
      issues: [
        { id: "parent", text: "親", status: "open" },
        { id: "sub", text: "子", status: "open" },
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
        { id: "e1", kind: "sub-issue-of", from: "sub", to: "parent" },
        { id: "e2", kind: "addresses", from: "c1", to: "parent" },
      ],
    }
    const p = computeLayout(g)
    const parentY = p.get("parent")?.y ?? 0
    const subY = p.get("sub")?.y ?? 0
    const claimY = p.get("c1")?.y ?? 0
    // sub-issue と Claim は親 Issue の 1 layer 下にあり、互いに同じ Y
    expect(subY).toBe(claimY)
    expect(subY - parentY).toBe(200)
  })

  it("groups arguments under their parent claim horizontally", () => {
    const g: Graph = {
      ...emptyGraph,
      claims: [
        {
          id: "c1",
          text: "C",
          status: "unresolved",
          confidence: "moderate",
          support_count: 2,
          attack_count: 0,
          unanswered_attacks: 0,
        },
      ],
      arguments: [
        {
          id: "a1",
          kind: "pro",
          data: [],
        },
        {
          id: "a2",
          kind: "pro",
          data: [],
        },
      ],
      edges: [
        { id: "e1", kind: "supports", from: "a1", to: "c1" },
        { id: "e2", kind: "supports", from: "a2", to: "c1" },
      ],
    }
    const p = computeLayout(g)
    const a1x = p.get("a1")?.x ?? 0
    const a2x = p.get("a2")?.x ?? 0
    const a1y = p.get("a1")?.y ?? 0
    const a2y = p.get("a2")?.y ?? 0
    expect(a1y).toBe(a2y)
    expect(a2x).toBeGreaterThan(a1x)
  })
})
