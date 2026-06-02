import type { Graph, Signal } from "../schema"
import { detectExtractionQualitySignals } from "./extractionQuality"

function now(): string {
  return new Date().toISOString()
}

/**
 * 未応答の反論：Con 論証で他からカウンター（attacks）を受けていないもの。
 *
 * 「対応」とは「反論に対する反論（カウンター）」を指す（B案）。
 * - incoming `attacks` がある → 対応済み
 * - その他のエッジ（supports 等）が来ていても対応とはみなさない
 */
export function detectUnansweredAttacks(graph: Graph): Signal[] {
  const result: Signal[] = []
  for (const arg of graph.arguments) {
    if (arg.kind !== "con") continue
    const hasCounter = graph.edges.some((e) => e.to === arg.id && e.kind === "attacks")
    if (!hasCounter) {
      result.push({
        kind: "unanswered_attack",
        affected_node_ids: [arg.id],
        computed_at: now(),
        source: "structural",
      })
    }
  }
  return result
}

/**
 * 未根拠の主張：incoming `supports` エッジが 0 件の Claim。
 */
export function detectUnsupportedClaims(graph: Graph): Signal[] {
  const result: Signal[] = []
  for (const claim of graph.claims) {
    const hasSupport = graph.edges.some((e) => e.to === claim.id && e.kind === "supports")
    if (!hasSupport) {
      result.push({
        kind: "unsupported_claim",
        affected_node_ids: [claim.id],
        computed_at: now(),
        source: "structural",
      })
    }
  }
  return result
}

/**
 * 基準不一致：同じ Claim を支える複数の Pro 論証が異なる Criterion で評価している。
 */
export function detectCriterionMismatch(graph: Graph): Signal[] {
  const result: Signal[] = []
  for (const claim of graph.claims) {
    const proArgIds = new Set(
      graph.edges.filter((e) => e.kind === "supports" && e.to === claim.id).map((e) => e.from),
    )
    const proArgs = graph.arguments.filter((a) => proArgIds.has(a.id) && a.kind === "pro")
    if (proArgs.length < 2) continue

    const criterionByArg = new Map<string, Set<string>>()
    for (const arg of proArgs) {
      const critIds = graph.edges
        .filter((e) => e.kind === "evaluates-by" && e.from === arg.id)
        .map((e) => e.to)
      criterionByArg.set(arg.id, new Set(critIds))
    }
    const allCriteria = new Set<string>()
    for (const set of criterionByArg.values()) {
      for (const c of set) allCriteria.add(c)
    }
    // 異なる基準が同時に使われている場合のみ警告
    if (allCriteria.size > 1) {
      result.push({
        kind: "criterion_mismatch",
        affected_node_ids: [claim.id, ...proArgs.map((a) => a.id), ...allCriteria],
        computed_at: now(),
        source: "structural",
      })
    }
  }
  return result
}

/**
 * 採用検討の余地あり: 「もう agreed に昇格しても良さそう」を提案する (argumentation-quality 課題 6)。
 *
 * 条件:
 *   - Claim.status が "unresolved"
 *   - 1 件以上の supports (Pro 論証) を受けている
 *   - supports 数 > attacks 数
 *   - 全ての attack 元 Argument が、何らかの counter (attacks) を受けている
 *     (= unanswered な反論が残っていない)
 *
 * これは「自動的に agreed にする」のではなく、ユーザーに状態遷移を促す
 * ポジティブガイドとして使う (`severity: "info"`)。
 */
export function detectReadyToAgree(graph: Graph): Signal[] {
  const result: Signal[] = []
  for (const claim of graph.claims) {
    if (claim.status !== "unresolved") continue

    const supportingArgIds = graph.edges
      .filter((e) => e.kind === "supports" && e.to === claim.id)
      .map((e) => e.from)
    const attackingArgIds = graph.edges
      .filter((e) => e.kind === "attacks" && e.to === claim.id)
      .map((e) => e.from)

    if (supportingArgIds.length === 0) continue
    if (supportingArgIds.length <= attackingArgIds.length) continue

    const allAttacksCounteracted = attackingArgIds.every((argId) =>
      graph.edges.some((e) => e.kind === "attacks" && e.to === argId),
    )
    if (!allAttacksCounteracted) continue

    result.push({
      kind: "ready_to_agree",
      affected_node_ids: [claim.id],
      computed_at: now(),
      source: "structural",
    })
  }
  return result
}

/**
 * 構造系シグナル全部を集約。
 * 抽出品質シグナル もここでまとめる。
 */
export function detectStructuralSignals(graph: Graph): Signal[] {
  // 動的 import を避けるため structural.ts 内で直接呼ぶ
  // (extractionQuality.ts は structural と同じ層なので循環参照のリスクなし)
  return [
    ...detectUnansweredAttacks(graph),
    ...detectUnsupportedClaims(graph),
    ...detectCriterionMismatch(graph),
    ...detectReadyToAgree(graph),
    ...detectExtractionQualitySignals(graph),
  ]
}

export function signalsForNode(signals: Signal[], nodeId: string): Signal[] {
  return signals.filter((s) => s.affected_node_ids.includes(nodeId))
}
