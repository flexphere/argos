import { beforeEach, describe, expect, it } from "vitest"
import { useUIStore } from "../src/store/uiStore"

beforeEach(() => {
  const s = useUIStore.getState()
  s.clearSelection()
  s.closeContextMenu()
})

const s = () => useUIStore.getState()

describe("uiStore - selection", () => {
  it("starts with empty selection", () => {
    expect(s().selectedNodeIds).toEqual([])
    expect(s().selectedEdgeIds).toEqual([])
  })

  it("selectNode sets a single node and clears edge selection", () => {
    s().selectEdge("e1")
    s().selectNode("a")
    expect(s().selectedNodeIds).toEqual(["a"])
    expect(s().selectedEdgeIds).toEqual([])
  })

  it("selectEdge sets a single edge and clears node selection", () => {
    s().selectNode("a")
    s().selectEdge("e1")
    expect(s().selectedEdgeIds).toEqual(["e1"])
    expect(s().selectedNodeIds).toEqual([])
  })

  it("setSelectedNodeIds replaces the selection", () => {
    s().setSelectedNodeIds(["a", "b", "c"])
    expect(s().selectedNodeIds).toEqual(["a", "b", "c"])
    s().setSelectedNodeIds(["d"])
    expect(s().selectedNodeIds).toEqual(["d"])
  })

  it("setSelectedNodeIds with identical ids is a no-op (same reference)", () => {
    s().setSelectedNodeIds(["a", "b"])
    const first = s().selectedNodeIds
    s().setSelectedNodeIds(["a", "b"])
    const second = s().selectedNodeIds
    expect(second).toBe(first)
  })

  it("clearSelection clears both node and edge selections", () => {
    s().setSelectedNodeIds(["a", "b"])
    s().setSelectedEdgeIds(["e1"])
    s().clearSelection()
    expect(s().selectedNodeIds).toEqual([])
    expect(s().selectedEdgeIds).toEqual([])
  })
})

describe("uiStore - contextMenu", () => {
  it("openContextMenu stores menu state", () => {
    s().openContextMenu({
      x: 100,
      y: 200,
      kind: "single-node",
      targetIds: ["a"],
    })
    const m = s().contextMenu
    expect(m?.kind).toBe("single-node")
    expect(m?.targetIds).toEqual(["a"])
    expect(m?.x).toBe(100)
    expect(m?.y).toBe(200)
  })

  it("openContextMenu can be called for selection kind with multiple ids", () => {
    s().openContextMenu({
      x: 0,
      y: 0,
      kind: "selection",
      targetIds: ["a", "b", "c"],
    })
    expect(s().contextMenu?.kind).toBe("selection")
    expect(s().contextMenu?.targetIds).toHaveLength(3)
  })

  it("closeContextMenu clears the menu", () => {
    s().openContextMenu({
      x: 0,
      y: 0,
      kind: "single-node",
      targetIds: ["g1"],
    })
    s().closeContextMenu()
    expect(s().contextMenu).toBeNull()
  })
})
