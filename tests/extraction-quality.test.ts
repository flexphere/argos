import { beforeEach, describe, expect, it } from "vitest"
import { applyExtraction } from "../src/io/applyExtraction"
import { useGraphStore } from "../src/store/graphStore"
import dbSelectionFixture from "./fixtures/extraction/db-selection.fixture"
import deployTargetFixture from "./fixtures/extraction/deploy-target.fixture"
import pubsubFixture from "./fixtures/extraction/pubsub.fixture"

/**
 * 抽出品質の回帰テスト (ADR-0003 Phase 3-A)。
 *
 * 戦略:
 *   - LLM を mock として、固定の抽出結果 (フィクスチャ) を applyExtraction に流す
 *   - 適用後の graph 状態が「構造的性質」を満たすことを検証
 *   - フィクスチャごとに minNodes/maxNodes 等の許容範囲を持たせ、
 *     apply ロジックの変更 (リファクタや新機能) が破壊的退行を起こさないか確認
 *
 * これは LLM 自体の回帰検出ではない (それは Tier 2: 手動 eval の領域)。
 * 本テストが落ちたら:
 *   - apply ロジックが想定外の変化をした
 *   - フィクスチャの想定範囲が現実と乖離した (フィクスチャ側を見直す)
 *
 * 新しいフィクスチャを追加する手順は tests/fixtures/extraction/README.md を参照。
 */

/** 全フィクスチャを 1 つの配列にまとめる (今後追加が想定される) */
const FIXTURES = [
  { name: "pubsub", ...pubsubFixture },
  { name: "deploy-target", ...deployTargetFixture },
  { name: "db-selection", ...dbSelectionFixture },
] as const

describe("extraction quality regression: golden dataset", () => {
  beforeEach(() => {
    useGraphStore.getState().reset()
  })

  for (const fixture of FIXTURES) {
    describe(`fixture: ${fixture.name}`, () => {
      it("apply 後のノード数が許容範囲", () => {
        applyExtraction(fixture.extraction)
        const g = useGraphStore.getState().graph

        const exp = fixture.expectations
        expect(g.issues.length, "issues").toBeGreaterThanOrEqual(exp.minIssues)
        expect(g.issues.length, "issues").toBeLessThanOrEqual(exp.maxIssues)
        expect(g.claims.length, "claims").toBeGreaterThanOrEqual(exp.minClaims)
        expect(g.claims.length, "claims").toBeLessThanOrEqual(exp.maxClaims)
        expect(g.arguments.length, "arguments").toBeGreaterThanOrEqual(exp.minArguments)
        expect(g.arguments.length, "arguments").toBeLessThanOrEqual(exp.maxArguments)
      })

      it("sub-issue-of エッジが期待値以上ある (指定があれば)", () => {
        applyExtraction(fixture.extraction)
        const g = useGraphStore.getState().graph
        if (fixture.expectations.minSubIssueOfEdges === undefined) return
        const subEdges = g.edges.filter((e) => e.kind === "sub-issue-of")
        expect(subEdges.length).toBeGreaterThanOrEqual(fixture.expectations.minSubIssueOfEdges)
      })

      it("alternative-to エッジが期待値以上ある (指定があれば)", () => {
        applyExtraction(fixture.extraction)
        const g = useGraphStore.getState().graph
        if (fixture.expectations.minAltToEdges === undefined) return
        const altEdges = g.edges.filter((e) => e.kind === "alternative-to")
        expect(altEdges.length).toBeGreaterThanOrEqual(fixture.expectations.minAltToEdges)
      })

      it("Criterion / Reference ノードと evaluates-by / cites エッジが期待値以上 (指定があれば, ADR-0007)", () => {
        applyExtraction(fixture.extraction)
        const g = useGraphStore.getState().graph
        const exp = fixture.expectations as {
          minCriteria?: number
          minReferences?: number
          minEvaluatesByEdges?: number
          minCitesEdges?: number
        }
        if (exp.minCriteria !== undefined) {
          expect(g.criteria.length).toBeGreaterThanOrEqual(exp.minCriteria)
        }
        if (exp.minReferences !== undefined) {
          expect(g.references.length).toBeGreaterThanOrEqual(exp.minReferences)
        }
        if (exp.minEvaluatesByEdges !== undefined) {
          const ee = g.edges.filter((e) => e.kind === "evaluates-by")
          expect(ee.length).toBeGreaterThanOrEqual(exp.minEvaluatesByEdges)
        }
        if (exp.minCitesEdges !== undefined) {
          const ce = g.edges.filter((e) => e.kind === "cites")
          expect(ce.length).toBeGreaterThanOrEqual(exp.minCitesEdges)
        }
      })

      it("整合性: orphan な Claim / Argument が無いこと (addresses/supports/attacks エッジで接続)", () => {
        applyExtraction(fixture.extraction)
        const g = useGraphStore.getState().graph

        // Claim はいずれかの Issue に addresses する
        const claimIdsAddressing = new Set(
          g.edges.filter((e) => e.kind === "addresses").map((e) => e.from),
        )
        const orphanClaims = g.claims.filter((c) => !claimIdsAddressing.has(c.id))
        expect(orphanClaims, "orphan claims (addresses 無し)").toEqual([])

        // Argument はいずれかの Claim を supports/attacks する
        const argIdsConnected = new Set(
          g.edges.filter((e) => e.kind === "supports" || e.kind === "attacks").map((e) => e.from),
        )
        const orphanArgs = g.arguments.filter((a) => !argIdsConnected.has(a.id))
        expect(orphanArgs, "orphan arguments (supports/attacks 無し)").toEqual([])
      })
    })
  }
})
