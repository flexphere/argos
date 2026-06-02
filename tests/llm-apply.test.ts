import { beforeEach, describe, expect, it } from "vitest"
import { applyExtraction } from "../src/io/applyExtraction"
import type { ExtractionResult } from "../src/schema/extraction"
import { useGraphStore } from "../src/store/graphStore"

beforeEach(() => {
  useGraphStore.getState().reset()
})

const s = () => useGraphStore.getState()

describe("applyExtraction", () => {
  it("creates Issue nodes from extraction", () => {
    const result: ExtractionResult = {
      issues: [{ ref: "i-1", text: "採用すべきか?" }],
      claims: [],
      arguments: [],
    }
    applyExtraction(result)
    expect(s().graph.issues).toHaveLength(1)
    expect(s().graph.issues[0].text).toBe("採用すべきか?")
  })

  it("creates Claim with addresses edge to Issue", () => {
    const result: ExtractionResult = {
      issues: [{ ref: "i-1", text: "I" }],
      claims: [{ ref: "c-1", text: "C", addresses: "i-1" }],
      arguments: [],
    }
    applyExtraction(result)
    const claim = s().graph.claims[0]
    const issue = s().graph.issues[0]
    const edge = s().graph.edges.find((e) => e.kind === "addresses")
    expect(edge?.from).toBe(claim.id)
    expect(edge?.to).toBe(issue.id)
  })

  it("creates Pro Argument with supports edge to Claim", () => {
    const result: ExtractionResult = {
      issues: [],
      claims: [{ ref: "c-1", text: "C", addresses: null }],
      arguments: [
        {
          ref: "a-1",
          kind: "pro",
          data: "良い理由",
          targets: "c-1",
        },
      ],
    }
    applyExtraction(result)
    const arg = s().graph.arguments[0]
    const claim = s().graph.claims[0]
    const edge = s().graph.edges.find((e) => e.kind === "supports")
    expect(arg.kind).toBe("pro")
    expect(edge?.from).toBe(arg.id)
    expect(edge?.to).toBe(claim.id)
  })

  it("creates Con Argument with attacks edge", () => {
    const result: ExtractionResult = {
      issues: [],
      claims: [{ ref: "c-1", text: "C", addresses: null }],
      arguments: [
        {
          ref: "a-1",
          kind: "con",
          data: "反対理由",
          targets: "c-1",
        },
      ],
    }
    applyExtraction(result)
    const arg = s().graph.arguments[0]
    const edge = s().graph.edges.find((e) => e.kind === "attacks")
    expect(edge?.from).toBe(arg.id)
  })

  it("skips edges when ref cannot be resolved", () => {
    const result: ExtractionResult = {
      issues: [],
      claims: [{ ref: "c-1", text: "C", addresses: "i-missing" }],
      arguments: [
        {
          ref: "a-1",
          kind: "pro",
          data: "x",
          targets: "c-missing",
        },
      ],
    }
    applyExtraction(result)
    expect(s().graph.edges).toHaveLength(0)
  })

  // ── sub-issue-of (ADR-0002) ──────────────────────────────────────

  it("生成: parent_ref が指定されたら sub-issue-of エッジを張る", () => {
    const result: ExtractionResult = {
      issues: [
        { ref: "i-1", text: "親議題" },
        { ref: "i-2", text: "子議題", parent_ref: "i-1" },
      ],
      claims: [],
      arguments: [],
    }
    applyExtraction(result)
    const parent = s().graph.issues.find((i) => i.text === "親議題")
    const child = s().graph.issues.find((i) => i.text === "子議題")
    expect(parent).toBeTruthy()
    expect(child).toBeTruthy()
    const edge = s().graph.edges.find((e) => e.kind === "sub-issue-of")
    expect(edge).toBeTruthy()
    expect(edge?.from).toBe(child?.id) // sub-issue 側が from
    expect(edge?.to).toBe(parent?.id) // 親 issue 側が to
  })

  it("parent_ref が null または undefined ならエッジを張らない", () => {
    const result: ExtractionResult = {
      issues: [
        { ref: "i-1", text: "I1" },
        { ref: "i-2", text: "I2", parent_ref: null },
        { ref: "i-3", text: "I3" },
      ],
      claims: [],
      arguments: [],
    }
    applyExtraction(result)
    expect(s().graph.edges.filter((e) => e.kind === "sub-issue-of")).toHaveLength(0)
  })

  it("親 Issue の ref が解決できない場合はスキップ", () => {
    const result: ExtractionResult = {
      issues: [{ ref: "i-1", text: "I1", parent_ref: "i-missing" }],
      claims: [],
      arguments: [],
    }
    applyExtraction(result)
    expect(s().graph.issues).toHaveLength(1)
    expect(s().graph.edges.filter((e) => e.kind === "sub-issue-of")).toHaveLength(0)
  })

  it("自己参照 (parent_ref === ref) は無視する", () => {
    const result: ExtractionResult = {
      issues: [{ ref: "i-1", text: "自分の親は自分", parent_ref: "i-1" }],
      claims: [],
      arguments: [],
    }
    applyExtraction(result)
    expect(s().graph.edges.filter((e) => e.kind === "sub-issue-of")).toHaveLength(0)
  })

  it("2 段の循環 (A→B→A) は弾く", () => {
    const result: ExtractionResult = {
      issues: [
        { ref: "i-a", text: "A", parent_ref: "i-b" },
        { ref: "i-b", text: "B", parent_ref: "i-a" },
      ],
      claims: [],
      arguments: [],
    }
    applyExtraction(result)
    // 順序的に i-a が先に処理される時点では、まだ i-b の parent_ref は未確定。
    // しかし wouldCreateCycle は extraction.issues 全体を見るので両方弾かれる。
    const subIssueEdges = s().graph.edges.filter((e) => e.kind === "sub-issue-of")
    expect(subIssueEdges).toHaveLength(0)
  })

  it("多段階の階層 (A→B→C) が正しくエッジ化される", () => {
    const result: ExtractionResult = {
      issues: [
        { ref: "i-a", text: "A (root)" },
        { ref: "i-b", text: "B (B is sub of A)", parent_ref: "i-a" },
        { ref: "i-c", text: "C (C is sub of B)", parent_ref: "i-b" },
      ],
      claims: [],
      arguments: [],
    }
    applyExtraction(result)
    const subIssueEdges = s().graph.edges.filter((e) => e.kind === "sub-issue-of")
    expect(subIssueEdges).toHaveLength(2)

    const a = s().graph.issues.find((i) => i.text === "A (root)")
    const b = s().graph.issues.find((i) => i.text === "B (B is sub of A)")
    const c = s().graph.issues.find((i) => i.text === "C (C is sub of B)")
    // B → A
    expect(subIssueEdges.some((e) => e.from === b?.id && e.to === a?.id)).toBe(true)
    // C → B
    expect(subIssueEdges.some((e) => e.from === c?.id && e.to === b?.id)).toBe(true)
  })

  it("places extracted nodes in a layered layout", () => {
    const result: ExtractionResult = {
      issues: [{ ref: "i-1", text: "I" }],
      claims: [{ ref: "c-1", text: "C", addresses: "i-1" }],
      arguments: [
        {
          ref: "a-1",
          kind: "pro",
          data: "x",
          targets: "c-1",
        },
      ],
    }
    applyExtraction(result)
    const issue = s().graph.issues[0]
    const claim = s().graph.claims[0]
    const arg = s().graph.arguments[0]
    // 同じカラム（index=0）、異なる y
    expect(issue.position?.x).toBe(claim.position?.x)
    expect(issue.position?.x).toBe(arg.position?.x)
    expect(issue.position?.y).toBeLessThan(claim.position?.y ?? 0)
    expect(claim.position?.y).toBeLessThan(arg.position?.y ?? 0)
  })

  // ── ADR-0007: Criterion / Reference 抽出 ─────────────────────
  describe("Criterion / Reference extraction (ADR-0007)", () => {
    it("creates Criterion nodes from `criteria` array", () => {
      const result: ExtractionResult = {
        issues: [],
        claims: [],
        arguments: [],
        criteria: [
          { ref: "crit-1", text: "コスト" },
          { ref: "crit-2", text: "保守性", weight: "strong" },
        ],
      }
      applyExtraction(result)
      const criteria = s().graph.criteria
      expect(criteria).toHaveLength(2)
      expect(criteria.find((c) => c.text === "コスト")).toBeDefined()
      expect(criteria.find((c) => c.text === "保守性")?.weight).toBe("strong")
    })

    it("creates Reference nodes from `references` array", () => {
      const result: ExtractionResult = {
        issues: [],
        claims: [],
        arguments: [],
        references: [
          { ref: "ref-1", title: "他社事例" },
          { ref: "ref-2", title: "RFC", uri: "https://example.com/rfc", excerpt: "..." },
        ],
      }
      applyExtraction(result)
      const refs = s().graph.references
      expect(refs).toHaveLength(2)
      expect(refs.find((r) => r.title === "RFC")?.uri).toBe("https://example.com/rfc")
    })

    it("creates evaluates-by edge from Argument to Criterion", () => {
      const result: ExtractionResult = {
        issues: [],
        claims: [{ ref: "c-1", text: "C", addresses: null }],
        arguments: [
          {
            ref: "a-1",
            kind: "pro",
            data: "x",
            targets: "c-1",
            evaluates_by: ["crit-1"],
          },
        ],
        criteria: [{ ref: "crit-1", text: "コスト" }],
      }
      applyExtraction(result)
      const arg = s().graph.arguments[0]
      const crit = s().graph.criteria[0]
      const edge = s().graph.edges.find((e) => e.kind === "evaluates-by")
      expect(edge?.from).toBe(arg.id)
      expect(edge?.to).toBe(crit.id)
    })

    it("creates cites edge from Argument to Reference", () => {
      const result: ExtractionResult = {
        issues: [],
        claims: [{ ref: "c-1", text: "C", addresses: null }],
        arguments: [
          {
            ref: "a-1",
            kind: "pro",
            data: "x",
            targets: "c-1",
            cites: ["ref-1"],
          },
        ],
        references: [{ ref: "ref-1", title: "他社事例" }],
      }
      applyExtraction(result)
      const arg = s().graph.arguments[0]
      const refNode = s().graph.references[0]
      const edge = s().graph.edges.find((e) => e.kind === "cites")
      expect(edge?.from).toBe(arg.id)
      expect(edge?.to).toBe(refNode.id)
    })

    it("skips evaluates_by / cites references that do not exist", () => {
      const result: ExtractionResult = {
        issues: [],
        claims: [{ ref: "c-1", text: "C", addresses: null }],
        arguments: [
          {
            ref: "a-1",
            kind: "pro",
            data: "x",
            targets: "c-1",
            evaluates_by: ["nonexistent-crit"],
            cites: ["nonexistent-ref"],
          },
        ],
        criteria: [],
        references: [],
      }
      applyExtraction(result)
      const evalEdges = s().graph.edges.filter((e) => e.kind === "evaluates-by")
      const citeEdges = s().graph.edges.filter((e) => e.kind === "cites")
      expect(evalEdges).toHaveLength(0)
      expect(citeEdges).toHaveLength(0)
    })

    it("supports multiple criteria/references per Argument", () => {
      const result: ExtractionResult = {
        issues: [],
        claims: [{ ref: "c-1", text: "C", addresses: null }],
        arguments: [
          {
            ref: "a-1",
            kind: "pro",
            data: "x",
            targets: "c-1",
            evaluates_by: ["crit-1", "crit-2"],
            cites: ["ref-1", "ref-2"],
          },
        ],
        criteria: [
          { ref: "crit-1", text: "コスト" },
          { ref: "crit-2", text: "保守性" },
        ],
        references: [
          { ref: "ref-1", title: "事例 A" },
          { ref: "ref-2", title: "事例 B" },
        ],
      }
      applyExtraction(result)
      const arg = s().graph.arguments[0]
      const evalEdges = s().graph.edges.filter(
        (e) => e.kind === "evaluates-by" && e.from === arg.id,
      )
      const citeEdges = s().graph.edges.filter((e) => e.kind === "cites" && e.from === arg.id)
      expect(evalEdges).toHaveLength(2)
      expect(citeEdges).toHaveLength(2)
    })
  })
})
