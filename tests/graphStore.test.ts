import { beforeEach, describe, expect, it } from "vitest"
import { useGraphStore } from "../src/store/graphStore"

beforeEach(() => {
  useGraphStore.getState().reset()
})

const s = () => useGraphStore.getState()

describe("graphStore - node CRUD", () => {
  it("addIssue creates a node with defaults", () => {
    const id = s().addIssue()
    const issue = s().graph.issues[0]
    expect(issue.id).toBe(id)
    expect(issue.text).toBe("新しい議題")
    expect(issue.status).toBe("open")
  })

  it("addIssue accepts partial overrides", () => {
    s().addIssue({ text: "custom", status: "resolved" })
    const issue = s().graph.issues[0]
    expect(issue.text).toBe("custom")
    expect(issue.status).toBe("resolved")
  })

  it("addClaim creates a node with claim defaults", () => {
    s().addClaim()
    const claim = s().graph.claims[0]
    expect(claim.status).toBe("unresolved")
    expect(claim.confidence).toBe("moderate")
    expect(claim.support_count).toBe(0)
    expect(claim.attack_count).toBe(0)
    expect(claim.unanswered_attacks).toBe(0)
  })

  it("addArgument creates a node with argument defaults", () => {
    s().addArgument()
    const arg = s().graph.arguments[0]
    expect(arg.kind).toBe("pro")
    expect(arg.data).toEqual([])
  })

  it("addCriterion creates a node with text default", () => {
    s().addCriterion()
    expect(s().graph.criteria[0].text).toBe("新しい評価基準")
  })

  it("addReference requires title", () => {
    s().addReference({ title: "doc 1" })
    expect(s().graph.references[0].title).toBe("doc 1")
  })

  it("updateNode merges updates across any node type", () => {
    const id = s().addIssue()
    s().updateNode(id, { text: "更新後", status: "deferred" })
    const issue = s().graph.issues[0]
    expect(issue.text).toBe("更新後")
    expect(issue.status).toBe("deferred")
  })

  it("setNodePosition updates only position", () => {
    const id = s().addClaim()
    s().setNodePosition(id, { x: 42, y: 99 })
    expect(s().graph.claims[0].position).toEqual({ x: 42, y: 99 })
  })

  it("deleteNode removes the target node from its array", () => {
    const id = s().addIssue()
    s().addIssue()
    s().deleteNode(id)
    expect(s().graph.issues).toHaveLength(1)
    expect(s().graph.issues[0].id).not.toBe(id)
  })

  it("deleteNode also removes edges connected to it", () => {
    const a = s().addIssue()
    const b = s().addClaim()
    s().addEdge("addresses", b, a)
    s().addEdge("supports", b, a)
    s().deleteNode(a)
    expect(s().graph.edges).toHaveLength(0)
  })
})

describe("graphStore - edge CRUD", () => {
  it("addEdge creates an edge with kind, from, to", () => {
    const a = s().addIssue()
    const b = s().addClaim()
    const id = s().addEdge("addresses", b, a)
    const edge = s().graph.edges[0]
    expect(edge.id).toBe(id)
    expect(edge.kind).toBe("addresses")
    expect(edge.from).toBe(b)
    expect(edge.to).toBe(a)
  })

  it("updateEdge merges updates", () => {
    const a = s().addIssue()
    const b = s().addClaim()
    const id = s().addEdge("supports", b, a)
    s().updateEdge(id, { kind: "attacks" })
    expect(s().graph.edges[0].kind).toBe("attacks")
  })

  it("deleteEdge removes the edge", () => {
    const a = s().addIssue()
    const b = s().addClaim()
    const id = s().addEdge("supports", b, a)
    s().deleteEdge(id)
    expect(s().graph.edges).toHaveLength(0)
  })
})

describe("graphStore - analysis_state", () => {
  it("structural_version starts at 0", () => {
    expect(s().graph.analysis_state.structural_version).toBe(0)
  })

  it("structural_version increments on structural changes", () => {
    const before = s().graph.analysis_state.structural_version
    s().addIssue()
    expect(s().graph.analysis_state.structural_version).toBe(before + 1)
  })

  it("setNodePosition does NOT increment structural_version", () => {
    const id = s().addClaim()
    const before = s().graph.analysis_state.structural_version
    s().setNodePosition(id, { x: 999, y: 999 })
    expect(s().graph.analysis_state.structural_version).toBe(before)
  })

  it("is_semantic_stale becomes true after a structural change", () => {
    s().addIssue()
    expect(s().graph.analysis_state.is_semantic_stale).toBe(true)
  })
})

describe("graphStore - reset / importGraph", () => {
  it("reset clears all nodes and edges", () => {
    s().addIssue()
    s().addClaim()
    s().reset()
    const g = s().graph
    expect(g.issues).toHaveLength(0)
    expect(g.claims).toHaveLength(0)
    expect(g.analysis_state.structural_version).toBe(0)
  })

  it("importGraph replaces the current graph", () => {
    s().addIssue()
    const newGraph = {
      issues: [
        {
          id: "i1",
          text: "imported",
          status: "open" as const,
        },
      ],
      claims: [],
      arguments: [],
      criteria: [],
      references: [],
      edges: [],
      analysis_state: { structural_version: 5, is_semantic_stale: false },
    }
    s().importGraph(newGraph)
    expect(s().graph.issues).toHaveLength(1)
    expect(s().graph.issues[0].text).toBe("imported")
    expect(s().graph.analysis_state.structural_version).toBe(5)
  })
})
