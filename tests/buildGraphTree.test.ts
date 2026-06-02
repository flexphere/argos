import { describe, expect, it } from "vitest"
import type { Graph } from "../src/schema"
import { buildGraphTree } from "../src/ui/GraphTreePanel"

const empty: Graph = {
  issues: [],
  claims: [],
  arguments: [],
  criteria: [],
  references: [],
  edges: [],
  analysis_state: { structural_version: 0, is_semantic_stale: false },
}

describe("buildGraphTree", () => {
  it("returns empty array for empty graph", () => {
    expect(buildGraphTree(empty)).toEqual([])
  })

  it("places Issue → Claim → Argument の入れ子で出力する", () => {
    const g: Graph = {
      ...empty,
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
          data: ["x"],
        },
      ],
      edges: [
        { id: "e1", kind: "addresses", from: "c1", to: "i1" },
        { id: "e2", kind: "supports", from: "a1", to: "c1" },
      ],
    }
    const trees = buildGraphTree(g)
    expect(trees).toHaveLength(1)
    expect(trees[0].id).toBe("i1")
    expect(trees[0].children).toHaveLength(1)
    expect(trees[0].children[0].id).toBe("c1")
    expect(trees[0].children[0].children).toHaveLength(1)
    expect(trees[0].children[0].children[0].id).toBe("a1")
  })

  it("sub-issue-of: 親 Issue の subtree 内にサブ Issue を入れ子表示する", () => {
    const g: Graph = {
      ...empty,
      issues: [
        { id: "parent", text: "親 Issue", status: "open" },
        { id: "sub", text: "子 Issue", status: "open" },
      ],
      edges: [{ id: "e1", kind: "sub-issue-of", from: "sub", to: "parent" }],
    }
    const trees = buildGraphTree(g)
    // root は親だけ。子は親の children に入っている
    expect(trees).toHaveLength(1)
    expect(trees[0].id).toBe("parent")
    expect(trees[0].children).toHaveLength(1)
    expect(trees[0].children[0].id).toBe("sub")
    expect(trees[0].children[0].type).toBe("issue")
  })

  it("親 Issue は claims を先に、sub-issues を後に並べる", () => {
    const g: Graph = {
      ...empty,
      issues: [
        { id: "parent", text: "親", status: "open" },
        { id: "sub", text: "子", status: "open" },
      ],
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
      edges: [
        { id: "e1", kind: "addresses", from: "c1", to: "parent" },
        { id: "e2", kind: "sub-issue-of", from: "sub", to: "parent" },
      ],
    }
    const trees = buildGraphTree(g)
    expect(trees).toHaveLength(1)
    expect(trees[0].children).toHaveLength(2)
    // 1 番目: claim、2 番目: sub-issue
    expect(trees[0].children[0].type).toBe("claim")
    expect(trees[0].children[1].type).toBe("issue")
  })

  it("多段階層 (A→B→C) が再帰的に表現される", () => {
    const g: Graph = {
      ...empty,
      issues: [
        { id: "a", text: "A", status: "open" },
        { id: "b", text: "B", status: "open" },
        { id: "c", text: "C", status: "open" },
      ],
      edges: [
        { id: "e1", kind: "sub-issue-of", from: "b", to: "a" },
        { id: "e2", kind: "sub-issue-of", from: "c", to: "b" },
      ],
    }
    const trees = buildGraphTree(g)
    expect(trees).toHaveLength(1)
    expect(trees[0].id).toBe("a")
    expect(trees[0].children).toHaveLength(1)
    expect(trees[0].children[0].id).toBe("b")
    expect(trees[0].children[0].children).toHaveLength(1)
    expect(trees[0].children[0].children[0].id).toBe("c")
  })

  it("循環参照 (A→B→A) があってもクラッシュせず leaf 化する", () => {
    const g: Graph = {
      ...empty,
      issues: [
        { id: "a", text: "A", status: "open" },
        { id: "b", text: "B", status: "open" },
      ],
      edges: [
        { id: "e1", kind: "sub-issue-of", from: "a", to: "b" },
        { id: "e2", kind: "sub-issue-of", from: "b", to: "a" },
      ],
    }
    // どちらも親を持つ扱いなので root が無い。trees は空配列で返る。
    const trees = buildGraphTree(g)
    expect(Array.isArray(trees)).toBe(true)
    // 循環をきっかけにスタックオーバーフローしないことが本テストの本質。
  })

  it("孤立した Claim / Argument は『未配置』グループに集約される", () => {
    const g: Graph = {
      ...empty,
      issues: [{ id: "i1", text: "I", status: "open" }],
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
      arguments: [
        {
          id: "a-orphan",
          kind: "pro",
          data: ["x"],
        },
      ],
    }
    const trees = buildGraphTree(g)
    expect(trees).toHaveLength(2) // issue + orphan group
    const orphanGroup = trees[1]
    expect(orphanGroup.type).toBe("orphan-group")
    expect(orphanGroup.children.map((c) => c.id).sort()).toEqual(["a-orphan", "c-orphan"].sort())
  })
})
