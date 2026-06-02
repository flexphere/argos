import { beforeEach, describe, expect, it } from "vitest"
import { useGraphStore } from "../src/store/graphStore"

beforeEach(() => {
  useGraphStore.getState().reset()
  useGraphStore.temporal.getState().clear()
})

const s = () => useGraphStore.getState()
const t = () => useGraphStore.temporal.getState()

describe("Undo/Redo (zundo temporal middleware)", () => {
  it("undo reverts an addIssue", () => {
    s().addIssue({ text: "I1" })
    expect(s().graph.issues).toHaveLength(1)
    t().undo()
    expect(s().graph.issues).toHaveLength(0)
  })

  it("redo replays the addIssue", () => {
    s().addIssue({ text: "I1" })
    t().undo()
    expect(s().graph.issues).toHaveLength(0)
    t().redo()
    expect(s().graph.issues).toHaveLength(1)
    expect(s().graph.issues[0].text).toBe("I1")
  })

  it("supports multi-step undo across different actions", () => {
    s().addIssue({ text: "I1" })
    const claimId = s().addClaim({ text: "C1" })
    s().updateNode(claimId, { text: "C1-edited" })

    expect(s().graph.claims[0].text).toBe("C1-edited")
    expect(s().graph.claims).toHaveLength(1)
    expect(s().graph.issues).toHaveLength(1)

    t().undo() // revert updateNode
    expect(s().graph.claims[0].text).toBe("C1")
    t().undo() // revert addClaim
    expect(s().graph.claims).toHaveLength(0)
    t().undo() // revert addIssue
    expect(s().graph.issues).toHaveLength(0)
  })

  it("clears redo history on new action after undo", () => {
    s().addIssue({ text: "I1" })
    s().addIssue({ text: "I2" })
    t().undo() // I2 取り消し
    expect(s().graph.issues).toHaveLength(1)

    // 新規操作 → redo は無効化される
    s().addIssue({ text: "I3" })
    t().redo() // 何も起きないはず
    expect(s().graph.issues.map((i) => i.text)).toEqual(["I1", "I3"])
  })

  it("pause prevents recording intermediate state changes", () => {
    s().addIssue({ text: "I1" })
    t().pause()
    s().addIssue({ text: "I2" })
    s().addIssue({ text: "I3" })
    t().resume()

    expect(s().graph.issues).toHaveLength(3)
    // I2, I3 は履歴に積まれていないので undo すると一気に I1 のみへ戻る
    t().undo()
    expect(s().graph.issues).toHaveLength(0)
  })

  it("undo addEdge restores the previous edge state", () => {
    const i1 = s().addIssue({ text: "I" })
    const c1 = s().addClaim({ text: "C" })
    s().addEdge("addresses", c1, i1)
    expect(s().graph.edges).toHaveLength(1)
    t().undo()
    expect(s().graph.edges).toHaveLength(0)
  })

  it("history is bounded (limit: 50)", () => {
    for (let i = 0; i < 60; i++) {
      s().addIssue({ text: `I${i}` })
    }
    // 60 件追加。すべて undo すると 60 件分戻れるはずだが、
    // limit:50 なので最初の 10 件分は履歴から落ちる
    for (let i = 0; i < 60; i++) {
      t().undo()
    }
    // 50 件 undo されて、最初の 10 件は残る
    expect(s().graph.issues.length).toBe(10)
  })
})
