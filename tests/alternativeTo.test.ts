import { beforeEach, describe, expect, it } from "vitest"
import { lookupNodeRef, resolveConnection } from "../src/graph/edgeKind"
import { applyExtraction } from "../src/io/applyExtraction"
import type { Graph } from "../src/schema"
import type { ExtractionResult } from "../src/schema/extraction"
import {
  detectAgreedAlternativesConflicts,
  detectExtractionQualitySignals,
} from "../src/signals/extractionQuality"
import { useGraphStore } from "../src/store/graphStore"

/**
 * ADR-0004: Claim 間の alternative-to 関係。
 * - 抽出 (claim_relations) → apply → エッジ生成
 * - resolveConnection の共通 Issue 制約
 * - graphStore.getAlternativesOf / bulkUpdateClaimStatus
 * - シグナル: agreed_alternatives_conflict
 */

const emptyGraph: Graph = {
  issues: [],
  claims: [],
  arguments: [],
  criteria: [],
  references: [],
  edges: [],
  analysis_state: { structural_version: 0, is_semantic_stale: false },
}

const s = () => useGraphStore.getState()

beforeEach(() => {
  useGraphStore.getState().reset()
})

describe("applyExtraction: claim_relations → alternative-to エッジ", () => {
  it("同一 Issue を addressing する Claim 同士に alt-to エッジが生成される", () => {
    const result: ExtractionResult = {
      issues: [{ ref: "i-1", text: "I" }],
      claims: [
        { ref: "c-1", text: "C1", addresses: "i-1" },
        { ref: "c-2", text: "C2", addresses: "i-1" },
      ],
      arguments: [],
      claim_relations: [{ ref_a: "c-1", ref_b: "c-2" }],
    }
    applyExtraction(result)
    const alt = s().graph.edges.find((e) => e.kind === "alternative-to")
    expect(alt).toBeTruthy()
    const c1 = s().graph.claims.find((c) => c.text === "C1")
    const c2 = s().graph.claims.find((c) => c.text === "C2")
    // canonical: ref 辞書順 (c-1 < c-2) で from=C1, to=C2
    expect(alt?.from).toBe(c1?.id)
    expect(alt?.to).toBe(c2?.id)
  })

  it("異なる Issue を addressing する Claim 同士の alt-to は破棄される (制約違反)", () => {
    const result: ExtractionResult = {
      issues: [
        { ref: "i-1", text: "I1" },
        { ref: "i-2", text: "I2" },
      ],
      claims: [
        { ref: "c-1", text: "C1", addresses: "i-1" },
        { ref: "c-2", text: "C2", addresses: "i-2" },
      ],
      arguments: [],
      claim_relations: [{ ref_a: "c-1", ref_b: "c-2" }],
    }
    applyExtraction(result)
    expect(s().graph.edges.filter((e) => e.kind === "alternative-to")).toHaveLength(0)
  })

  it("自己参照 (ref_a === ref_b) は無視する", () => {
    const result: ExtractionResult = {
      issues: [{ ref: "i-1", text: "I" }],
      claims: [{ ref: "c-1", text: "C1", addresses: "i-1" }],
      arguments: [],
      claim_relations: [{ ref_a: "c-1", ref_b: "c-1" }],
    }
    applyExtraction(result)
    expect(s().graph.edges.filter((e) => e.kind === "alternative-to")).toHaveLength(0)
  })

  it("同じペアの重複指定はエッジ 1 本にまとまる (canonical 化)", () => {
    const result: ExtractionResult = {
      issues: [{ ref: "i-1", text: "I" }],
      claims: [
        { ref: "c-1", text: "C1", addresses: "i-1" },
        { ref: "c-2", text: "C2", addresses: "i-1" },
      ],
      arguments: [],
      claim_relations: [
        { ref_a: "c-1", ref_b: "c-2" },
        { ref_a: "c-2", ref_b: "c-1" }, // 逆順だが同ペア
      ],
    }
    applyExtraction(result)
    expect(s().graph.edges.filter((e) => e.kind === "alternative-to")).toHaveLength(1)
  })
})

describe("resolveConnection: Claim ↔ Claim alternative-to", () => {
  it("共通 Issue を addressing する Claim 同士は alternative-to を返す", () => {
    const a = {
      id: "c1",
      type: "claim" as const,
      addressedIssues: new Set(["i1"]),
    }
    const b = {
      id: "c2",
      type: "claim" as const,
      addressedIssues: new Set(["i1"]),
    }
    const res = resolveConnection(a, b)
    expect(res?.kind).toBe("alternative-to")
    // canonical: id 辞書順小さい方が from
    expect(res?.from).toBe("c1")
    expect(res?.to).toBe("c2")
  })

  it("共通 Issue が無い Claim 同士は接続不可 (null) — 代替案は同じ Issue を addressing する必要がある", () => {
    const a = {
      id: "c1",
      type: "claim" as const,
      addressedIssues: new Set(["i1"]),
    }
    const b = {
      id: "c2",
      type: "claim" as const,
      addressedIssues: new Set(["i2"]),
    }
    expect(resolveConnection(a, b)).toBeNull()
  })

  it("addressedIssues が無い Claim 同士も接続不可", () => {
    const a = { id: "c1", type: "claim" as const }
    const b = { id: "c2", type: "claim" as const }
    expect(resolveConnection(a, b)).toBeNull()
  })
})

describe("lookupNodeRef: Claim に addressedIssues を埋める", () => {
  it("addresses エッジから Claim の addressedIssues を取得", () => {
    const graph: Graph = {
      ...emptyGraph,
      issues: [
        { id: "i1", text: "I1", status: "open" },
        { id: "i2", text: "I2", status: "open" },
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
        { id: "e1", kind: "addresses", from: "c1", to: "i1" },
        { id: "e2", kind: "addresses", from: "c1", to: "i2" },
      ],
    }
    const ref = lookupNodeRef(graph, "c1")
    expect(ref?.type).toBe("claim")
    expect([...(ref?.addressedIssues ?? [])].sort()).toEqual(["i1", "i2"])
  })
})

describe("graphStore: getAlternativesOf / bulkUpdateClaimStatus", () => {
  it("alternative-to で繋がる Claim ID を双方向で取得できる", () => {
    const store = s()
    const c1 = store.addClaim({ text: "C1" })
    const c2 = store.addClaim({ text: "C2" })
    const c3 = store.addClaim({ text: "C3" })
    store.addEdge("alternative-to", c1, c2)
    store.addEdge("alternative-to", c3, c1)

    const alts1 = useGraphStore.getState().getAlternativesOf(c1)
    expect(alts1.sort()).toEqual([c2, c3].sort())
    const alts2 = useGraphStore.getState().getAlternativesOf(c2)
    expect(alts2).toEqual([c1])
  })

  it("bulkUpdateClaimStatus: 一括 status 更新", () => {
    const store = s()
    const c1 = store.addClaim({ text: "C1" })
    const c2 = store.addClaim({ text: "C2" })
    const c3 = store.addClaim({ text: "C3" })
    useGraphStore.getState().bulkUpdateClaimStatus([c1, c2], "rejected")
    const graph = useGraphStore.getState().graph
    expect(graph.claims.find((c) => c.id === c1)?.status).toBe("rejected")
    expect(graph.claims.find((c) => c.id === c2)?.status).toBe("rejected")
    expect(graph.claims.find((c) => c.id === c3)?.status).toBe("unresolved") // 対象外
  })

  it("bulkUpdateClaimStatus: onlyIfStatus フィルタ", () => {
    const store = s()
    const c1 = store.addClaim({ text: "C1" })
    const c2 = store.addClaim({ text: "C2" })
    useGraphStore.getState().updateNode(c2, { status: "agreed" })
    useGraphStore.getState().bulkUpdateClaimStatus([c1, c2], "rejected", {
      onlyIfStatus: "unresolved",
    })
    const graph = useGraphStore.getState().graph
    expect(graph.claims.find((c) => c.id === c1)?.status).toBe("rejected") // unresolved だったので変更
    expect(graph.claims.find((c) => c.id === c2)?.status).toBe("agreed") // 既に agreed なのでスキップ
  })
})

describe("signal: agreed_alternatives_conflict", () => {
  it("alternative-to で繋がる Claim 両方が agreed のときに検出", () => {
    const graph: Graph = {
      ...emptyGraph,
      claims: [
        {
          id: "c1",
          text: "C1",
          status: "agreed",
          confidence: "moderate",
          support_count: 0,
          attack_count: 0,
          unanswered_attacks: 0,
        },
        {
          id: "c2",
          text: "C2",
          status: "agreed",
          confidence: "moderate",
          support_count: 0,
          attack_count: 0,
          unanswered_attacks: 0,
        },
      ],
      edges: [{ id: "e1", kind: "alternative-to", from: "c1", to: "c2" }],
    }
    const signals = detectAgreedAlternativesConflicts(graph)
    expect(signals).toHaveLength(1)
    expect(signals[0].kind).toBe("agreed_alternatives_conflict")
    expect(signals[0].affected_node_ids.sort()).toEqual(["c1", "c2"])
  })

  it("片方だけ agreed なら検出しない (= 想定の決着状態)", () => {
    const graph: Graph = {
      ...emptyGraph,
      claims: [
        {
          id: "c1",
          text: "C1",
          status: "agreed",
          confidence: "moderate",
          support_count: 0,
          attack_count: 0,
          unanswered_attacks: 0,
        },
        {
          id: "c2",
          text: "C2",
          status: "rejected",
          confidence: "moderate",
          support_count: 0,
          attack_count: 0,
          unanswered_attacks: 0,
        },
      ],
      edges: [{ id: "e1", kind: "alternative-to", from: "c1", to: "c2" }],
    }
    expect(detectAgreedAlternativesConflicts(graph)).toHaveLength(0)
  })

  it("detectExtractionQualitySignals に集約される", () => {
    const graph: Graph = {
      ...emptyGraph,
      claims: [
        {
          id: "c1",
          text: "C1",
          status: "agreed",
          confidence: "moderate",
          support_count: 0,
          attack_count: 0,
          unanswered_attacks: 0,
        },
        {
          id: "c2",
          text: "C2",
          status: "agreed",
          confidence: "moderate",
          support_count: 0,
          attack_count: 0,
          unanswered_attacks: 0,
        },
      ],
      edges: [
        { id: "e1", kind: "alternative-to", from: "c1", to: "c2" },
        { id: "e2", kind: "addresses", from: "c1", to: "i-dummy" }, // unreachable_issue を避けるため
      ],
      issues: [{ id: "i-dummy", text: "I", status: "open" }],
    }
    const signals = detectExtractionQualitySignals(graph)
    const kinds = signals.map((s) => s.kind)
    expect(kinds).toContain("agreed_alternatives_conflict")
  })
})
