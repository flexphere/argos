import { beforeEach, describe, expect, it } from "vitest"
import type { SemanticAnalysisResult } from "../src/schema/semantic"
import { useGraphStore } from "../src/store/graphStore"

/**
 * ADR-0005: Argument 接続先ミスマッチ
 * - applySemanticAnalysis が misplacement_suggestion を書き込む
 * - reattachArgument がエッジと kind を正しく差し替える
 * - dismissMisplacementSuggestion がクリアする
 * - misplaced_argument シグナルが semantic_signals に乗る
 */

const s = () => useGraphStore.getState()

beforeEach(() => {
  useGraphStore.getState().reset()
})

describe("applySemanticAnalysis: misplacement", () => {
  it("misplacement_suggestion を Argument に書き込み、シグナルを発行する", () => {
    const aid = s().addArgument({ data: ["x"] })
    const cid = s().addClaim({ text: "candidate" })

    const result: SemanticAnalysisResult = {
      driftFindings: [],
      misplacementFindings: [
        {
          argumentRef: aid,
          candidateClaimRef: cid,
          candidateKind: "supports",
          reason: "より自然",
        },
      ],
    }
    s().applySemanticAnalysis(result)

    const arg = s().graph.arguments[0]
    expect(arg.misplacement_suggestion).toEqual({
      candidate_claim_id: cid,
      candidate_kind: "supports",
      reason: "より自然",
    })

    const signals = s().graph.semantic_signals ?? []
    const misplaced = signals.find((s) => s.kind === "misplaced_argument")
    expect(misplaced).toBeTruthy()
    expect(misplaced?.affected_node_ids).toContain(aid)
    expect(misplaced?.affected_node_ids).toContain(cid)
  })

  it("候補 ID が無効な findings は破棄される (signal も発行されない)", () => {
    const aid = s().addArgument({ data: ["x"] })
    const result: SemanticAnalysisResult = {
      driftFindings: [],
      misplacementFindings: [
        {
          argumentRef: aid,
          candidateClaimRef: "non-existent",
          candidateKind: "supports",
          reason: "x",
        },
        {
          argumentRef: "non-existent-arg",
          candidateClaimRef: "non-existent",
          candidateKind: "attacks",
          reason: "y",
        },
      ],
    }
    s().applySemanticAnalysis(result)
    expect(s().graph.arguments[0].misplacement_suggestion).toBeUndefined()
    const signals = s().graph.semantic_signals ?? []
    expect(signals.filter((s) => s.kind === "misplaced_argument")).toHaveLength(0)
  })

  it("空の misplacementFindings は noop", () => {
    s().addArgument({ data: ["x"] })
    s().applySemanticAnalysis({
      driftFindings: [],
      misplacementFindings: [],
    })
    expect(s().graph.arguments[0].misplacement_suggestion).toBeUndefined()
  })
})

describe("reattachArgument", () => {
  it("supports/attacks エッジを新 target に差し替え、kind を更新する", () => {
    const c1 = s().addClaim({ text: "C1" })
    const c2 = s().addClaim({ text: "C2" })
    const aid = s().addArgument({ data: ["x"], kind: "con" })
    s().addEdge("attacks", aid, c1)
    s().applySemanticAnalysis({
      driftFindings: [],
      misplacementFindings: [
        {
          argumentRef: aid,
          candidateClaimRef: c2,
          candidateKind: "supports",
          reason: "より自然",
        },
      ],
    })

    s().reattachArgument(aid, c2, "supports")

    const arg = s().graph.arguments[0]
    expect(arg.kind).toBe("pro")
    expect(arg.misplacement_suggestion).toBeUndefined()
    const edges = s().graph.edges.filter((e) => e.from === aid)
    expect(edges).toHaveLength(1)
    expect(edges[0].kind).toBe("supports")
    expect(edges[0].to).toBe(c2)
  })

  it("Claim や Argument が存在しなければ noop", () => {
    const c1 = s().addClaim({ text: "C1" })
    const aid = s().addArgument({ data: ["x"] })
    s().addEdge("supports", aid, c1)
    s().reattachArgument(aid, "non-existent", "supports")
    s().reattachArgument("non-existent-arg", c1, "attacks")
    // どちらも変化なし
    const arg = s().graph.arguments[0]
    expect(arg.kind).toBe("pro")
    const edges = s().graph.edges.filter((e) => e.from === aid)
    expect(edges).toHaveLength(1)
    expect(edges[0].kind).toBe("supports")
    expect(edges[0].to).toBe(c1)
  })
})

describe("dismissMisplacementSuggestion", () => {
  it("misplacement_suggestion だけを消し、エッジは保持する", () => {
    const c1 = s().addClaim({ text: "C1" })
    const c2 = s().addClaim({ text: "C2" })
    const aid = s().addArgument({ data: ["x"] })
    s().addEdge("supports", aid, c1)
    s().applySemanticAnalysis({
      driftFindings: [],
      misplacementFindings: [
        {
          argumentRef: aid,
          candidateClaimRef: c2,
          candidateKind: "attacks",
          reason: "x",
        },
      ],
    })

    s().dismissMisplacementSuggestion(aid)

    const arg = s().graph.arguments[0]
    expect(arg.misplacement_suggestion).toBeUndefined()
    // エッジは元のまま
    const edges = s().graph.edges.filter((e) => e.from === aid)
    expect(edges[0].to).toBe(c1)
  })
})
