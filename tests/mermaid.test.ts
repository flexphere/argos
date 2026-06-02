import { describe, expect, it } from "vitest"
import { graphToMermaid } from "../src/io/mermaid"
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

describe("graphToMermaid", () => {
  it("starts with 'graph TD' header", () => {
    const out = graphToMermaid(emptyGraph)
    expect(out.split("\n")[0]).toBe("graph TD")
  })

  it("emits an Issue node with bracket syntax", () => {
    const out = graphToMermaid({
      ...emptyGraph,
      issues: [{ id: "i1", text: "採用すべきか?", status: "open" }],
    })
    expect(out).toMatch(/n1\["Issue: 採用すべきか\?"\]/)
  })

  it("emits a Claim node with stadium syntax + status class", () => {
    const out = graphToMermaid({
      ...emptyGraph,
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
    })
    expect(out).toMatch(/n1\(\["Claim: 採用する"\]\):::unresolved/)
  })

  it("emits Pro/Con argument with kindLabel prefix", () => {
    const out = graphToMermaid({
      ...emptyGraph,
      arguments: [
        {
          id: "a1",
          kind: "pro",
          data: ["コスト削減"],
        },
        {
          id: "a2",
          kind: "con",
          data: ["学習コスト"],
        },
      ],
    })
    expect(out).toContain('n1>"Pro: コスト削減"]')
    expect(out).toContain('n2>"Con: 学習コスト"]')
  })

  it("emits criterion as hexagon", () => {
    const out = graphToMermaid({
      ...emptyGraph,
      criteria: [{ id: "cr1", text: "コスト" }],
    })
    expect(out).toMatch(/n1\{\{"Criterion: コスト"\}\}/)
  })

  it("renders edges with arrows per kind and edge label", () => {
    const out = graphToMermaid({
      ...emptyGraph,
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
      arguments: [
        {
          id: "a1",
          kind: "pro",
          data: ["x"],
        },
        {
          id: "a2",
          kind: "con",
          data: ["y"],
        },
      ],
      edges: [
        { id: "e1", kind: "supports", from: "a1", to: "c1" },
        { id: "e2", kind: "attacks", from: "a2", to: "c1" },
      ],
    })
    expect(out).toMatch(/n\d+ -->\|supports\| n\d+/)
    expect(out).toMatch(/n\d+ ==>\|attacks\| n\d+/)
  })

  it("reverses hierarchical edges to flow Top to Bottom", () => {
    const out = graphToMermaid({
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
      edges: [{ id: "e1", kind: "addresses", from: "c1", to: "i1" }],
    })
    // i1=n1, c1=n2 のエイリアス。reversed なので n1 -.-> n2 になる
    expect(out).toMatch(/n1 -\.->\|addresses\| n2/)
  })

  it("wraps each Issue in its own subgraph and stacks them with invisible links", () => {
    const out = graphToMermaid({
      ...emptyGraph,
      issues: [
        { id: "i1", text: "I1", status: "open" },
        { id: "i2", text: "I2", status: "open" },
        { id: "i3", text: "I3", status: "open" },
      ],
    })
    // 3 subgraphs と direction TB
    expect((out.match(/subgraph s\d+/g) ?? []).length).toBe(3)
    expect((out.match(/^\s+direction TB$/gm) ?? []).length).toBe(3)
    // 連続する subgraph を invisible link で繋ぐ
    expect(out).toMatch(/s1 ~~~ s2/)
    expect(out).toMatch(/s2 ~~~ s3/)
  })

  it("includes classDef definitions for all claim statuses", () => {
    const out = graphToMermaid(emptyGraph)
    expect(out).toContain("classDef agreed")
    expect(out).toContain("classDef rejected")
    expect(out).toContain("classDef unresolved")
    expect(out).toContain("classDef outOfScope")
  })

  it("escapes embedded double quotes in labels", () => {
    const out = graphToMermaid({
      ...emptyGraph,
      issues: [{ id: "i1", text: 'これは"重要"な問題', status: "open" }],
    })
    expect(out).toContain("これは'重要'な問題")
  })
})
