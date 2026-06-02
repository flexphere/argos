import type { Graph, Position } from "../schema"
import { EDGE_HIERARCHY_DIRECTION } from "./conversion"

// レイアウト定数
const NODE_WIDTH = 220
const X_GAP = 60
const Y_LAYER_GAP = 200
const X_GROUP_GAP = 80
const BASE_X = 80
const BASE_Y = 80

/**
 * 汎用ツリーレイアウト。
 *
 * 各エッジを「visual 親 → visual 子」として解釈し、ノード型に依らず子は
 * 親の下にぶら下がる。複数親を持つノードは「最初に見つかった親」だけを採用
 * （その他のエッジは描画されるが配置に影響しない）。
 *
 * 例:
 *   Issue                     ← root (parent=none)
 *    ├─ sub-issue (sub-issue-of)
 *    │   └─ Claim ...
 *    └─ Claim (addresses)
 *        ├─ Argument (supports/attacks)
 *        ├─ Criterion (evaluates-by)
 *        └─ Reference (cites)
 *
 * - visual 親子の判定は EDGE_HIERARCHY_DIRECTION ベース:
 *     "from-is-child" → edge.to が親、edge.from が子 (例: addresses, supports, attacks, sub-issue-of)
 *     "from-is-parent" → edge.from が親、edge.to が子 (例: evaluates-by, cites)
 *     "symmetric" → 親子計算から除外 (例: alternative-to は別途 cluster 並べ替えで扱う)
 * - root (visual 親を持たないノード) は **1 行に並べる** (行ラップしない)。
 *   行ラップを廃止した経緯は docs/plan/edge-overlap-layout.md / B 案を参照。
 *   グラフが横長になっても horizontal scroll + サイドパネル navigation で
 *   到達可能なので、subtree 同士の重なりを構造的に避ける方を優先する。
 */
export function computeLayout(graph: Graph): Map<string, Position> {
  const positions = new Map<string, Position>()

  // 全ノード ID 集合
  const allNodes = [
    ...graph.issues,
    ...graph.claims,
    ...graph.arguments,
    ...graph.criteria,
    ...graph.references,
  ]
  const allNodeIds = new Set(allNodes.map((n) => n.id))

  if (allNodes.length === 0) return positions

  // ── visual 親子マップ ──
  //   visualChildren: 親ID → 子ID 配列（edge の入力順を保つ）
  //   visualParent:   子ID → 親ID（最初に見つかった親を採用）
  const visualChildren = new Map<string, string[]>()
  const visualParent = new Map<string, string>()

  for (const edge of graph.edges) {
    const direction = EDGE_HIERARCHY_DIRECTION[edge.kind]
    // symmetric は親子関係を作らない (例: alternative-to は別途 cluster 並べ替えで扱う)。
    // 旧実装では symmetric edge が「非反転 default 経路」に流れ込み、first-parent-wins
    // で運良く救われる状態だったが、本 ADR で意図的に skip するように明示化。
    if (direction === "symmetric") continue

    const parentId = direction === "from-is-child" ? edge.to : edge.from
    const childId = direction === "from-is-child" ? edge.from : edge.to

    if (!allNodeIds.has(parentId) || !allNodeIds.has(childId)) continue
    if (visualParent.has(childId)) continue // first-parent-wins
    visualParent.set(childId, parentId)
    const arr = visualChildren.get(parentId) ?? []
    arr.push(childId)
    visualChildren.set(parentId, arr)
  }

  // alternative-to で繋がる Claim 群を、親 (Issue) の children 配列内で
  // 隣接して並ぶよう並び替える。Union-Find で alt クラスタを求め、cluster id 順
  // にソートする (cluster 未割り当ての子は元順序を保つ)。
  const claimIds = new Set(graph.claims.map((c) => c.id))
  const altAdjacency = new Map<string, Set<string>>()
  for (const edge of graph.edges) {
    if (edge.kind !== "alternative-to") continue
    if (!claimIds.has(edge.from) || !claimIds.has(edge.to)) continue
    const arr1 = altAdjacency.get(edge.from) ?? new Set()
    arr1.add(edge.to)
    altAdjacency.set(edge.from, arr1)
    const arr2 = altAdjacency.get(edge.to) ?? new Set()
    arr2.add(edge.from)
    altAdjacency.set(edge.to, arr2)
  }
  // Union-Find で cluster id を割り当てる
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let cur = x
    while (parent.get(cur) !== undefined && parent.get(cur) !== cur) {
      cur = parent.get(cur) ?? cur
    }
    parent.set(x, cur)
    return cur
  }
  const union = (x: string, y: string) => {
    const rx = find(x)
    const ry = find(y)
    if (rx !== ry) parent.set(rx, ry)
  }
  for (const [from, neighbors] of altAdjacency) {
    parent.set(from, parent.get(from) ?? from)
    for (const to of neighbors) {
      parent.set(to, parent.get(to) ?? to)
      union(from, to)
    }
  }
  // children を並び替え: 同じ alt cluster の Claim が隣り合うように。
  // - 非 Claim および alt cluster 無しの Claim は元の順序を維持
  // - Claim は (cluster id を初出順に並べ、各 cluster 内も初出順) で並ぶ
  for (const [parentId, children] of visualChildren) {
    const claims = children.filter((c) => claimIds.has(c))
    if (claims.length < 2) continue
    const clusterOrder: string[] = [] // 初出 cluster id 順
    const clusterMembers = new Map<string, string[]>()
    for (const cid of claims) {
      const root = parent.has(cid) ? find(cid) : cid // クラスタ無しは自分自身
      if (!clusterMembers.has(root)) {
        clusterOrder.push(root)
        clusterMembers.set(root, [])
      }
      clusterMembers.get(root)?.push(cid)
    }
    const reorderedClaims: string[] = []
    for (const root of clusterOrder) {
      reorderedClaims.push(...(clusterMembers.get(root) ?? []))
    }
    // 元配列を「非 Claim を維持、Claim 位置に並び替えた配列を流し込む」形で再構築
    const result: string[] = []
    let claimCursor = 0
    for (const c of children) {
      if (claimIds.has(c)) {
        result.push(reorderedClaims[claimCursor])
        claimCursor++
      } else {
        result.push(c)
      }
    }
    visualChildren.set(parentId, result)
  }

  // root: visual 親を持たないノード（graph.{issues,...} の宣言順を保つ）
  const rootIds = allNodes.filter((n) => !visualParent.has(n.id)).map((n) => n.id)

  // ── subtree サイズ（width / height）の post-order 計算 + メモ化 ──
  const widthMap = new Map<string, number>()
  const heightMap = new Map<string, number>()

  const computeSize = (nodeId: string, visiting: Set<string>): { w: number; h: number } => {
    if (visiting.has(nodeId)) {
      // 循環参照ガード：自分自身を leaf 扱いする
      return { w: NODE_WIDTH, h: Y_LAYER_GAP }
    }
    const cachedW = widthMap.get(nodeId)
    const cachedH = heightMap.get(nodeId)
    if (cachedW !== undefined && cachedH !== undefined) {
      return { w: cachedW, h: cachedH }
    }

    visiting.add(nodeId)
    try {
      const children = visualChildren.get(nodeId) ?? []
      if (children.length === 0) {
        widthMap.set(nodeId, NODE_WIDTH)
        heightMap.set(nodeId, Y_LAYER_GAP)
        return { w: NODE_WIDTH, h: Y_LAYER_GAP }
      }
      const sizes = children.map((c) => computeSize(c, visiting))
      const childTotalW = sizes.reduce((a, s) => a + s.w, 0) + (children.length - 1) * X_GAP
      const childMaxH = Math.max(...sizes.map((s) => s.h))
      const w = Math.max(NODE_WIDTH, childTotalW)
      const h = Y_LAYER_GAP + childMaxH
      widthMap.set(nodeId, w)
      heightMap.set(nodeId, h)
      return { w, h }
    } finally {
      visiting.delete(nodeId)
    }
  }

  // ── 配置（pre-order） ──
  // x: bounding-box の左端、y: layer の上端
  // 戻り値はそのノードの X center（呼び出し側で親の中心位置決定に使う）
  const placeNodeAt = (nodeId: string, x: number, y: number, visiting: Set<string>): number => {
    if (visiting.has(nodeId)) {
      // 循環時：単独 leaf として配置
      const w = widthMap.get(nodeId) ?? NODE_WIDTH
      const cx = x + w / 2
      positions.set(nodeId, { x: cx - NODE_WIDTH / 2, y })
      return cx
    }
    visiting.add(nodeId)
    try {
      const w = widthMap.get(nodeId) ?? NODE_WIDTH
      const children = visualChildren.get(nodeId) ?? []

      if (children.length === 0) {
        const cx = x + w / 2
        positions.set(nodeId, { x: cx - NODE_WIDTH / 2, y })
        return cx
      }

      // 子を水平に並べる
      const childWidths = children.map((c) => widthMap.get(c) ?? NODE_WIDTH)
      const childTotalW = childWidths.reduce((a, b) => a + b, 0) + (children.length - 1) * X_GAP
      let cursorX = x + (w - childTotalW) / 2
      const childCenters: number[] = []
      children.forEach((childId, idx) => {
        const cCx = placeNodeAt(childId, cursorX, y + Y_LAYER_GAP, visiting)
        childCenters.push(cCx)
        cursorX += childWidths[idx] + X_GAP
      })

      // 自ノードは「子の中心の平均（左端〜右端中央）」の上に置く
      const firstCx = childCenters[0]
      const lastCx = childCenters[childCenters.length - 1]
      const nodeCx = (firstCx + lastCx) / 2
      positions.set(nodeId, { x: nodeCx - NODE_WIDTH / 2, y })
      return nodeCx
    } finally {
      visiting.delete(nodeId)
    }
  }

  // ── root ごとに unit を作って 1 行に並べる (行ラップしない) ──
  for (const rootId of rootIds) {
    computeSize(rootId, new Set())
  }

  let cursorX = BASE_X
  const cursorY = BASE_Y

  for (const rootId of rootIds) {
    const unitW = widthMap.get(rootId) ?? NODE_WIDTH
    placeNodeAt(rootId, cursorX, cursorY, new Set())
    cursorX += unitW + X_GROUP_GAP
  }

  return positions
}
