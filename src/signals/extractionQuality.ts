import type { Graph, Signal } from "../schema"

/**
 * 抽出品質シグナル。
 *
 * これらは LLM 抽出やマージ・編集の結果として **「グラフに取り残された
 * 接続なしノード」** を検出するためのシグナル。
 *
 * 既存の構造系シグナル (unsupported_claim, unanswered_attack 等) は
 * 「議論内容としての不備」を検出するのに対し、本ファイルのシグナルは
 * **「グラフ構造としての孤立」** を検出する役割。
 *
 * 例:
 *   - LLM が Argument を抽出したが、targets の Claim ref が解決できず
 *     supports/attacks エッジが張られなかった → orphan_argument
 *   - LLM が Issue を 1 つ抽出したが対応する Claim を抽出し損ねた → unreachable_issue
 */

function now(): string {
  return new Date().toISOString()
}

/**
 * orphan_argument: どの Claim にも supports/attacks エッジを持たない Argument。
 *
 * apply 時に targets が解決できなかったり、ユーザーが手動で Argument を作って
 * まだ接続していない場合に該当する。
 */
export function detectOrphanArguments(graph: Graph): Signal[] {
  const connected = new Set(
    graph.edges.filter((e) => e.kind === "supports" || e.kind === "attacks").map((e) => e.from),
  )
  const result: Signal[] = []
  for (const arg of graph.arguments) {
    if (connected.has(arg.id)) continue
    result.push({
      kind: "orphan_argument",
      affected_node_ids: [arg.id],
      computed_at: now(),
      source: "structural",
    })
  }
  return result
}

/**
 * unreachable_issue: どの Claim も addresses していない Issue。
 *
 * sub-issue-of で別 Issue を持っている場合や、root Issue として議論の
 * 出発点になっている場合でも、Claim が一つも紐づいていなければ
 * 「議論が起きていない議題」として警告する。
 */
export function detectUnreachableIssues(graph: Graph): Signal[] {
  const addressed = new Set(graph.edges.filter((e) => e.kind === "addresses").map((e) => e.to))
  const result: Signal[] = []
  for (const issue of graph.issues) {
    if (addressed.has(issue.id)) continue
    result.push({
      kind: "unreachable_issue",
      affected_node_ids: [issue.id],
      computed_at: now(),
      source: "structural",
    })
  }
  return result
}

/**
 * disconnected_criterion: どの Claim も評価していない Criterion。
 *
 * Criterion は本来「Claim を比較するための評価軸」。誰も評価していない
 * Criterion は情報として死んでいるので警告。
 */
export function detectDisconnectedCriteria(graph: Graph): Signal[] {
  const used = new Set(graph.edges.filter((e) => e.kind === "evaluates-by").map((e) => e.to))
  const result: Signal[] = []
  for (const cri of graph.criteria) {
    if (used.has(cri.id)) continue
    result.push({
      kind: "disconnected_criterion",
      affected_node_ids: [cri.id],
      computed_at: now(),
      source: "structural",
    })
  }
  return result
}

/**
 * disconnected_reference: どの node も引用していない Reference。
 *
 * cites エッジが 1 本も無い Reference は情報として死んでいる。
 */
export function detectDisconnectedReferences(graph: Graph): Signal[] {
  const cited = new Set(graph.edges.filter((e) => e.kind === "cites").map((e) => e.to))
  const result: Signal[] = []
  for (const ref of graph.references) {
    if (cited.has(ref.id)) continue
    result.push({
      kind: "disconnected_reference",
      affected_node_ids: [ref.id],
      computed_at: now(),
      source: "structural",
    })
  }
  return result
}

/**
 * agreed_alternatives_conflict: alternative-to で繋がる Claim が両方 agreed の矛盾。
 *
 * 通常は SidePanel の自動 reject ConfirmDialog で防がれるが、Import 経由で
 * 矛盾状態のグラフが入る、または手動で両方を agreed にした等のケースを検出する。
 */
export function detectAgreedAlternativesConflicts(graph: Graph): Signal[] {
  const claimById = new Map(graph.claims.map((c) => [c.id, c]))
  const seen = new Set<string>() // 重複検出用 (canonical "a|b" key)
  const result: Signal[] = []
  for (const e of graph.edges) {
    if (e.kind !== "alternative-to") continue
    const a = claimById.get(e.from)
    const b = claimById.get(e.to)
    if (!a || !b) continue
    if (a.status !== "agreed" || b.status !== "agreed") continue
    const [k1, k2] = a.id < b.id ? [a.id, b.id] : [b.id, a.id]
    const key = `${k1}|${k2}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      kind: "agreed_alternatives_conflict",
      affected_node_ids: [a.id, b.id],
      computed_at: now(),
      source: "structural",
    })
  }
  return result
}

/**
 * 抽出品質シグナルを全種別まとめて検出。
 */
export function detectExtractionQualitySignals(graph: Graph): Signal[] {
  return [
    ...detectOrphanArguments(graph),
    ...detectUnreachableIssues(graph),
    ...detectDisconnectedCriteria(graph),
    ...detectDisconnectedReferences(graph),
    ...detectAgreedAlternativesConflicts(graph),
  ]
}
