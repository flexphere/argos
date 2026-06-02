import { computeLayout } from "../graph/layout"
import type { ExtractedIssue, ExtractionResult } from "../schema/extraction"
import { useGraphStore } from "../store/graphStore"

/**
 * Claim ペアを canonical 化する (ref 辞書順小さい方を first に置く)。
 * 重複防止と alternative-to エッジの canonical 方向の決定に使う。
 */
function canonicalClaimPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

/**
 * LLM 抽出結果を Graph store に取り込む application service。
 *
 * 役割:
 *   - ref ベースの抽出結果を実 UUID にマッピング
 *   - addresses / supports / attacks / sub-issue-of エッジを自動生成
 *   - 反映後に階層レイアウトを実行 (MiniMap アスペクト比のため targetWidth を調整)
 *
 * Issue は 2-pass で処理する:
 *   1st pass: 全 Issue を作成して ref → id を確定（自己参照や前後参照に対応するため）
 *   2nd pass: parent_ref を解決して sub-issue-of エッジを張る
 */
/**
 * 戻り値は ref → 実 UUID の対応マップ。後続で精算したい呼び出し側
 * (例: skill が precompute した semantic suggestion を ref ベースで適用する) が
 * このマップを使って ref を実 ID に解決できるようにする。
 */
export function applyExtraction(result: ExtractionResult): Map<string, string> {
  const store = useGraphStore.getState()
  const refToId = new Map<string, string>()

  // 1st pass: Issue を全て作成
  for (const issue of result.issues) {
    const id = store.addIssue({ text: issue.text })
    refToId.set(issue.ref, id)
  }

  // 2nd pass: parent_ref を解決して sub-issue-of エッジを生成
  // - 親未存在の場合はスキップ（ref タイポや LLM の出力ミスを許容）
  // - 自己参照 (parent_ref === ref) は禁止
  // - 循環参照ガード: 親が子孫になる関係は弾く
  for (const issue of result.issues) {
    if (!issue.parent_ref) continue
    if (issue.parent_ref === issue.ref) continue
    const childId = refToId.get(issue.ref)
    const parentId = refToId.get(issue.parent_ref)
    if (!childId || !parentId) continue
    if (wouldCreateCycle(result.issues, issue.ref, issue.parent_ref)) continue
    store.addEdge("sub-issue-of", childId, parentId)
  }

  for (const claim of result.claims) {
    const id = store.addClaim({ text: claim.text })
    refToId.set(claim.ref, id)
    if (claim.addresses) {
      const issueId = refToId.get(claim.addresses)
      if (issueId) store.addEdge("addresses", id, issueId)
    }
  }

  for (const arg of result.arguments) {
    const id = store.addArgument({
      kind: arg.kind,
      data: [arg.data],
    })
    refToId.set(arg.ref, id)
    const claimId = refToId.get(arg.targets)
    if (claimId) {
      store.addEdge(arg.kind === "pro" ? "supports" : "attacks", id, claimId)
    }
  }

  // 3rd pass: Claim 間の alternative-to エッジ
  // 不変条件: 共通 Issue を addressing している Claim ペアのみ受け入れる
  // 重複防止: canonical 方向 (ref 辞書順) で生成 + 既存ペア検出
  const addressesByClaim = new Map<string, Set<string>>()
  const currentGraph = useGraphStore.getState().graph
  for (const e of currentGraph.edges) {
    if (e.kind !== "addresses") continue
    const set = addressesByClaim.get(e.from) ?? new Set()
    set.add(e.to)
    addressesByClaim.set(e.from, set)
  }
  const altSeen = new Set<string>() // canonical "fromRef|toRef" 重複検出用
  for (const rel of result.claim_relations ?? []) {
    if (rel.ref_a === rel.ref_b) continue
    const [refA, refB] = canonicalClaimPair(rel.ref_a, rel.ref_b)
    const key = `${refA}|${refB}`
    if (altSeen.has(key)) continue
    altSeen.add(key)

    const idA = refToId.get(refA)
    const idB = refToId.get(refB)
    if (!idA || !idB) continue

    // 共通 Issue を addressing しているか確認 (不変条件)
    const issuesA = addressesByClaim.get(idA) ?? new Set()
    const issuesB = addressesByClaim.get(idB) ?? new Set()
    const hasCommonIssue = [...issuesA].some((i) => issuesB.has(i))
    if (!hasCommonIssue) continue

    store.addEdge("alternative-to", idA, idB)
  }

  // 4th pass: Criterion / Reference ノードを作成
  for (const c of result.criteria ?? []) {
    const id = store.addCriterion({ text: c.text, weight: c.weight })
    refToId.set(c.ref, id)
  }
  for (const r of result.references ?? []) {
    const id = store.addReference({ title: r.title, uri: r.uri, excerpt: r.excerpt })
    refToId.set(r.ref, id)
  }

  // 5th pass: Argument の evaluates_by / cites を解決してエッジ生成
  // Argument ノード自体は 2nd pass で作成済 (refToId に登録済) なので、ここでは
  // エッジを張るだけ。ref 未存在 (LLM タイポ等) はスキップして defensive に動く。
  for (const arg of result.arguments) {
    const argId = refToId.get(arg.ref)
    if (!argId) continue
    for (const critRef of arg.evaluates_by ?? []) {
      const critId = refToId.get(critRef)
      if (critId) store.addEdge("evaluates-by", argId, critId)
    }
    for (const refRef of arg.cites ?? []) {
      const refId = refToId.get(refRef)
      if (refId) store.addEdge("cites", argId, refId)
    }
  }

  // 反映後に自動レイアウト。行ラップは廃止 (Issue は 1 行に並ぶ)、
  // 経緯は docs/plan/edge-overlap-layout.md / B 案を参照。
  const positions = computeLayout(useGraphStore.getState().graph)
  store.setNodePositions(positions)

  return refToId
}

/**
 * 親 Issue を child から遡って辿った場合に、childRef に戻ってしまう
 * （= サイクル）かを判定する。
 * 例: A.parent=B, B.parent=A は addEdge せずスキップする。
 */
function wouldCreateCycle(issues: ExtractedIssue[], childRef: string, parentRef: string): boolean {
  const byRef = new Map(issues.map((i) => [i.ref, i]))
  const visited = new Set<string>()
  let cursor: string | undefined | null = parentRef
  while (cursor) {
    if (cursor === childRef) return true
    if (visited.has(cursor)) return true // 既存サイクルにぶつかった
    visited.add(cursor)
    cursor = byRef.get(cursor)?.parent_ref ?? null
  }
  return false
}
