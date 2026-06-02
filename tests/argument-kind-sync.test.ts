import { beforeEach, describe, expect, it } from "vitest"
import { useGraphStore } from "../src/store/graphStore"

describe("Argument.kind 変更時の supports/attacks 自動同期", () => {
  beforeEach(() => {
    useGraphStore.getState().reset()
  })

  it("pro→con に変えると supports → attacks に追従する", () => {
    const s = useGraphStore.getState()
    const claimId = s.addClaim({ text: "C" })
    const argId = s.addArgument({
      kind: "pro",
      data: ["D"],
    })
    const edgeId = s.addEdge("supports", argId, claimId)

    // pro → con に変更
    useGraphStore.getState().updateNode(argId, { kind: "con" })

    const edge = useGraphStore.getState().graph.edges.find((e) => e.id === edgeId)
    expect(edge?.kind).toBe("attacks")
  })

  it("con→pro に変えると attacks → supports に追従する", () => {
    const s = useGraphStore.getState()
    const claimId = s.addClaim({ text: "C" })
    const argId = s.addArgument({
      kind: "con",
      data: ["D"],
    })
    const edgeId = s.addEdge("attacks", argId, claimId)

    useGraphStore.getState().updateNode(argId, { kind: "pro" })

    const edge = useGraphStore.getState().graph.edges.find((e) => e.id === edgeId)
    expect(edge?.kind).toBe("supports")
  })

  it("Argument に紐づかない supports/attacks エッジは影響を受けない", () => {
    const s = useGraphStore.getState()
    const claimId = s.addClaim({ text: "C" })
    const argId = s.addArgument({
      kind: "pro",
      data: ["D"],
    })
    s.addEdge("supports", argId, claimId)

    // 別の Argument（kind 変更されていない）の supports エッジ
    const otherArgId = s.addArgument({
      kind: "con",
      data: ["D2"],
    })
    const otherEdgeId = s.addEdge("attacks", otherArgId, claimId)

    // 最初の argument だけ kind 変更
    useGraphStore.getState().updateNode(argId, { kind: "con" })

    const otherEdge = useGraphStore.getState().graph.edges.find((e) => e.id === otherEdgeId)
    // 他の argument の edge は変わらない
    expect(otherEdge?.kind).toBe("attacks")
  })

  it("Argument 以外のノードで kind 更新しても edge は変わらない", () => {
    const s = useGraphStore.getState()
    const issueId = s.addIssue({ text: "I" })
    const claimId = s.addClaim({ text: "C" })
    const argId = s.addArgument({
      kind: "pro",
      data: ["D"],
    })
    const edgeId = s.addEdge("supports", argId, claimId)

    // Issue や Claim に kind: "pro" を渡しても無視される想定（そもそも該当ノードに kind フィールドがない）
    useGraphStore.getState().updateNode(issueId, { text: "I2" })
    useGraphStore.getState().updateNode(claimId, { text: "C2" })

    const edge = useGraphStore.getState().graph.edges.find((e) => e.id === edgeId)
    expect(edge?.kind).toBe("supports")
  })
})
