import { describe, expect, it } from "vitest"
import type { Graph } from "../src/schema"
import {
  detectCriterionMismatch,
  detectReadyToAgree,
  detectStructuralSignals,
  detectUnansweredAttacks,
  detectUnsupportedClaims,
  signalsForNode,
} from "../src/signals"

const empty: Graph = {
  issues: [],
  claims: [],
  arguments: [],
  criteria: [],
  references: [],
  edges: [],
  analysis_state: { structural_version: 0, is_semantic_stale: false },
}

describe("detectUnansweredAttacks", () => {
  it("flags a Con argument with no incoming edge", () => {
    const g: Graph = {
      ...empty,
      claims: [
        {
          id: "c1",
          text: "x",
          status: "unresolved",
          confidence: "moderate",
          support_count: 0,
          attack_count: 1,
          unanswered_attacks: 1,
        },
      ],
      arguments: [
        {
          id: "a1",
          kind: "con",
          data: [],
        },
      ],
      edges: [{ id: "e1", kind: "attacks", from: "a1", to: "c1" }],
    }
    const signals = detectUnansweredAttacks(g)
    expect(signals).toHaveLength(1)
    expect(signals[0].affected_node_ids).toContain("a1")
  })

  it("does NOT flag a Con argument that has incoming edge", () => {
    const g: Graph = {
      ...empty,
      arguments: [
        {
          id: "a1",
          kind: "con",
          data: [],
        },
        {
          id: "a2",
          kind: "con",
          data: [],
        },
      ],
      edges: [{ id: "e1", kind: "attacks", from: "a2", to: "a1" }],
    }
    const signals = detectUnansweredAttacks(g)
    // a2 is unanswered, a1 has a response
    expect(signals.map((s) => s.affected_node_ids[0])).toEqual(["a2"])
  })

  it("ignores Pro arguments", () => {
    const g: Graph = {
      ...empty,
      arguments: [
        {
          id: "a1",
          kind: "pro",
          data: [],
        },
      ],
    }
    expect(detectUnansweredAttacks(g)).toHaveLength(0)
  })

  it("incoming `supports` does NOT count as a response", () => {
    const g: Graph = {
      ...empty,
      arguments: [
        {
          id: "con1",
          kind: "con",
          data: [],
        },
        {
          id: "pro1",
          kind: "pro",
          data: [],
        },
      ],
      // pro1 が con1 を supports しても「対応」とはみなさない
      edges: [{ id: "e1", kind: "supports", from: "pro1", to: "con1" }],
    }
    const signals = detectUnansweredAttacks(g)
    expect(signals.map((s) => s.affected_node_ids[0])).toContain("con1")
  })
})

describe("detectUnsupportedClaims", () => {
  it("flags Claims with no supports edge", () => {
    const g: Graph = {
      ...empty,
      claims: [
        {
          id: "c1",
          text: "x",
          status: "unresolved",
          confidence: "moderate",
          support_count: 0,
          attack_count: 0,
          unanswered_attacks: 0,
        },
      ],
    }
    expect(detectUnsupportedClaims(g)).toHaveLength(1)
  })

  it("does NOT flag claims with at least one supports edge", () => {
    const g: Graph = {
      ...empty,
      claims: [
        {
          id: "c1",
          text: "x",
          status: "unresolved",
          confidence: "moderate",
          support_count: 1,
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
      edges: [{ id: "e1", kind: "supports", from: "a1", to: "c1" }],
    }
    expect(detectUnsupportedClaims(g)).toHaveLength(0)
  })

  it("attacks-only does not count as support", () => {
    const g: Graph = {
      ...empty,
      claims: [
        {
          id: "c1",
          text: "x",
          status: "unresolved",
          confidence: "moderate",
          support_count: 0,
          attack_count: 1,
          unanswered_attacks: 0,
        },
      ],
      arguments: [
        {
          id: "a1",
          kind: "con",
          data: [],
        },
      ],
      edges: [{ id: "e1", kind: "attacks", from: "a1", to: "c1" }],
    }
    expect(detectUnsupportedClaims(g)).toHaveLength(1)
  })
})

describe("detectCriterionMismatch", () => {
  it("flags Claim with two Pro args using different criteria", () => {
    const g: Graph = {
      ...empty,
      claims: [
        {
          id: "c1",
          text: "x",
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
      criteria: [
        { id: "cr1", text: "コスト" },
        { id: "cr2", text: "速度" },
      ],
      edges: [
        { id: "e1", kind: "supports", from: "a1", to: "c1" },
        { id: "e2", kind: "supports", from: "a2", to: "c1" },
        { id: "e3", kind: "evaluates-by", from: "a1", to: "cr1" },
        { id: "e4", kind: "evaluates-by", from: "a2", to: "cr2" },
      ],
    }
    const signals = detectCriterionMismatch(g)
    expect(signals).toHaveLength(1)
    expect(signals[0].affected_node_ids).toContain("c1")
    expect(signals[0].affected_node_ids).toContain("cr1")
    expect(signals[0].affected_node_ids).toContain("cr2")
  })

  it("does NOT flag when Pro args share the same criterion", () => {
    const g: Graph = {
      ...empty,
      claims: [
        {
          id: "c1",
          text: "x",
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
      criteria: [{ id: "cr1", text: "コスト" }],
      edges: [
        { id: "e1", kind: "supports", from: "a1", to: "c1" },
        { id: "e2", kind: "supports", from: "a2", to: "c1" },
        { id: "e3", kind: "evaluates-by", from: "a1", to: "cr1" },
        { id: "e4", kind: "evaluates-by", from: "a2", to: "cr1" },
      ],
    }
    expect(detectCriterionMismatch(g)).toHaveLength(0)
  })

  it("does NOT flag when only one Pro argument exists", () => {
    const g: Graph = {
      ...empty,
      claims: [
        {
          id: "c1",
          text: "x",
          status: "unresolved",
          confidence: "moderate",
          support_count: 1,
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
      criteria: [{ id: "cr1", text: "コスト" }],
      edges: [
        { id: "e1", kind: "supports", from: "a1", to: "c1" },
        { id: "e2", kind: "evaluates-by", from: "a1", to: "cr1" },
      ],
    }
    expect(detectCriterionMismatch(g)).toHaveLength(0)
  })
})

describe("detectStructuralSignals + signalsForNode", () => {
  it("aggregates all detectors", () => {
    const g: Graph = {
      ...empty,
      claims: [
        {
          id: "c1",
          text: "x",
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
          kind: "con",
          data: [],
        },
      ],
      edges: [{ id: "e1", kind: "attacks", from: "a1", to: "c1" }],
    }
    const signals = detectStructuralSignals(g)
    const kinds = signals.map((s) => s.kind).sort()
    // 抽出品質シグナル (Phase 3-B) で a1 が attacks 経由で接続済みのため orphan_argument は出ない。
    // c1 は addresses 接続が無いので unreachable_issue とは別系で unsupported_claim は出る。
    expect(kinds).toEqual(["unanswered_attack", "unsupported_claim"])
  })

  it("signalsForNode filters by affected node id", () => {
    const g: Graph = {
      ...empty,
      claims: [
        {
          id: "c1",
          text: "x",
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
          kind: "con",
          data: [],
        },
      ],
    }
    const signals = detectStructuralSignals(g)
    // a1 は edges を持たないので Phase 3-B の orphan_argument も付く
    expect(
      signalsForNode(signals, "a1")
        .map((s) => s.kind)
        .sort(),
    ).toEqual(["orphan_argument", "unanswered_attack"])
    expect(
      signalsForNode(signals, "c1")
        .map((s) => s.kind)
        .sort(),
    ).toEqual(["unsupported_claim"])
  })
})

describe("detectReadyToAgree", () => {
  // テスト用に最小限の Claim と Argument を作るヘルパー
  function claim(id: string, status: "unresolved" | "agreed" | "rejected" = "unresolved") {
    return {
      id,
      text: id,
      status,
      confidence: "moderate" as const,
      support_count: 0,
      attack_count: 0,
      unanswered_attacks: 0,
    }
  }
  function arg(id: string, kind: "pro" | "con") {
    return {
      id,
      kind,
      data: [],
    }
  }

  it("flags an unresolved Claim with ≥1 support, no attacks", () => {
    const g: Graph = {
      ...empty,
      claims: [claim("c1")],
      arguments: [arg("a1", "pro")],
      edges: [{ id: "e1", kind: "supports", from: "a1", to: "c1" }],
    }
    const signals = detectReadyToAgree(g)
    expect(signals).toHaveLength(1)
    expect(signals[0].affected_node_ids).toEqual(["c1"])
  })

  it("flags when supports > attacks AND all attacks are counter-attacked", () => {
    const g: Graph = {
      ...empty,
      claims: [claim("c1")],
      arguments: [arg("a1", "pro"), arg("a2", "pro"), arg("a3", "con"), arg("a4", "con")],
      edges: [
        { id: "e1", kind: "supports", from: "a1", to: "c1" },
        { id: "e2", kind: "supports", from: "a2", to: "c1" },
        { id: "e3", kind: "attacks", from: "a3", to: "c1" },
        // a3 (attack) には counter-attack a4 が当たっている
        { id: "e4", kind: "attacks", from: "a4", to: "a3" },
      ],
    }
    expect(detectReadyToAgree(g)).toHaveLength(1)
  })

  it("does NOT flag when an attack has no counter-attack", () => {
    const g: Graph = {
      ...empty,
      claims: [claim("c1")],
      arguments: [arg("a1", "pro"), arg("a2", "pro"), arg("a3", "con")],
      edges: [
        { id: "e1", kind: "supports", from: "a1", to: "c1" },
        { id: "e2", kind: "supports", from: "a2", to: "c1" },
        { id: "e3", kind: "attacks", from: "a3", to: "c1" },
        // a3 への counter なし → unanswered
      ],
    }
    expect(detectReadyToAgree(g)).toHaveLength(0)
  })

  it("does NOT flag when supports <= attacks", () => {
    const g: Graph = {
      ...empty,
      claims: [claim("c1")],
      arguments: [arg("a1", "pro"), arg("a2", "con"), arg("a3", "con")],
      edges: [
        { id: "e1", kind: "supports", from: "a1", to: "c1" },
        { id: "e2", kind: "attacks", from: "a2", to: "c1" },
        { id: "e3", kind: "attacks", from: "a3", to: "c1" },
        { id: "e4", kind: "attacks", from: "a2", to: "a3" },
        { id: "e5", kind: "attacks", from: "a3", to: "a2" },
      ],
    }
    expect(detectReadyToAgree(g)).toHaveLength(0)
  })

  it("does NOT flag when Claim has no supporting argument", () => {
    const g: Graph = {
      ...empty,
      claims: [claim("c1")],
    }
    expect(detectReadyToAgree(g)).toHaveLength(0)
  })

  it("does NOT flag when Claim status is not unresolved", () => {
    const g: Graph = {
      ...empty,
      claims: [claim("c1", "agreed")],
      arguments: [arg("a1", "pro")],
      edges: [{ id: "e1", kind: "supports", from: "a1", to: "c1" }],
    }
    expect(detectReadyToAgree(g)).toHaveLength(0)
  })
})
