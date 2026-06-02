import { describe, expect, it } from "vitest"
import {
  EDGE_HIERARCHY_DIRECTION,
  graphToFlowEdges,
  resolveManualConnection,
} from "../src/graph/conversion"
import { edgeKindSchema } from "../src/schema"
import type { Graph } from "../src/schema"

describe("resolveManualConnection", () => {
  it("reverses for from-is-child kinds (階層 edge: 上→下 で描いたので保存時は反転)", () => {
    // visualSource → visualTarget で描かれたものを storage 方向に反転する
    expect(resolveManualConnection("A", "B", "supports")).toEqual({
      from: "B",
      to: "A",
    })
    expect(resolveManualConnection("A", "B", "attacks")).toEqual({
      from: "B",
      to: "A",
    })
    expect(resolveManualConnection("A", "B", "addresses")).toEqual({
      from: "B",
      to: "A",
    })
    expect(resolveManualConnection("A", "B", "sub-issue-of")).toEqual({
      from: "B",
      to: "A",
    })
  })

  it("does not reverse evaluates-by / cites（from が既に親なので反転しない）", () => {
    expect(resolveManualConnection("A", "B", "evaluates-by")).toEqual({
      from: "A",
      to: "B",
    })
    expect(resolveManualConnection("A", "B", "cites")).toEqual({
      from: "A",
      to: "B",
    })
  })

  it("round-trip: pre-reversed storage + display reversal yields the user's drawn direction", () => {
    // ユーザーが visualSource → visualTarget で描いた
    const visualSource = "A"
    const visualTarget = "B"
    const kind = "supports" // hierarchical

    // storage への変換（pre-reverse）
    const { from, to } = resolveManualConnection(visualSource, visualTarget, kind)

    // graphToFlowEdges による表示時反転を再現
    const graph: Graph = {
      issues: [],
      claims: [],
      arguments: [],
      criteria: [],
      references: [],
      edges: [{ id: "e1", kind: "supports", from, to }],
      analysis_state: { structural_version: 1, is_semantic_stale: false },
    }
    const flowEdges = graphToFlowEdges(graph)
    expect(flowEdges[0].source).toBe(visualSource)
    expect(flowEdges[0].target).toBe(visualTarget)
  })
})

describe("EDGE_HIERARCHY_DIRECTION", () => {
  it("from-is-child: 階層 edge (子→親 保存方向、表示時に反転して 親→子 描画)", () => {
    expect(EDGE_HIERARCHY_DIRECTION.addresses).toBe("from-is-child")
    expect(EDGE_HIERARCHY_DIRECTION.supports).toBe("from-is-child")
    expect(EDGE_HIERARCHY_DIRECTION.attacks).toBe("from-is-child")
    expect(EDGE_HIERARCHY_DIRECTION["sub-issue-of"]).toBe("from-is-child")
  })

  it("from-is-parent: 葉付け edge (親→葉 保存方向、反転不要)", () => {
    expect(EDGE_HIERARCHY_DIRECTION["evaluates-by"]).toBe("from-is-parent")
    expect(EDGE_HIERARCHY_DIRECTION.cites).toBe("from-is-parent")
  })

  it("symmetric: 対称 edge (親子関係なし、layout の親子計算からは除外)", () => {
    expect(EDGE_HIERARCHY_DIRECTION["alternative-to"]).toBe("symmetric")
  })

  it("exhaustive: 全ての EdgeKind が direction を宣言している (新 kind 追加検出)", () => {
    for (const kind of edgeKindSchema.options) {
      expect(EDGE_HIERARCHY_DIRECTION[kind], `${kind} に direction 宣言が必要`).toBeDefined()
    }
  })
})
