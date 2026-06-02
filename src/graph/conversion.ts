import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react"
import type { EdgeKind, Graph, Position } from "../schema"

interface PositionedNode {
  id: string
  position?: Position
}

function defaultPosition(index: number): Position {
  const cols = 5
  const col = index % cols
  const row = Math.floor(index / cols)
  return { x: col * 220 + 80, y: row * 160 + 80 }
}

export function graphToFlowNodes(graph: Graph): RFNode[] {
  const result: RFNode[] = []
  let idx = 0

  const push = (n: PositionedNode, type: string) => {
    result.push({
      id: n.id,
      type,
      position: n.position ?? defaultPosition(idx),
      data: n as unknown as Record<string, unknown>,
    })
    idx++
  }

  for (const n of graph.issues) push(n, "issue")
  for (const n of graph.claims) push(n, "claim")
  for (const n of graph.arguments) push(n, "argument")
  for (const n of graph.criteria) push(n, "criterion")
  for (const n of graph.references) push(n, "reference")

  return result
}

/**
 * 各 edge kind の **階層方向** を宣言する一元定義。
 *
 * - `"from-is-child"`: 保存方向 from = 視覚上の子(下), to = 親(上)
 *   - 例: addresses (Claim→Issue), supports/attacks (Arg→Claim), sub-issue-of
 *   - 表示時に source/target を反転して「親(上)→子(下)」に流す
 * - `"from-is-parent"`: 保存方向 from = 視覚上の親(上), to = 子/葉(下)
 *   - 例: evaluates-by (Arg→Criterion), cites (Arg→Reference)
 *   - from が既に親なので反転不要
 * - `"symmetric"`: 親子関係なし (対称)
 *   - 例: alternative-to (Claim ↔ Claim、canonical 方向は ref 辞書順)
 *   - layout の親子計算からは除外、描画も反転なし
 *
 * `Record<EdgeKind, ...>` の exhaustive 性により、新 edge kind 追加時には
 * TypeScript が direction 宣言の有無をコンパイル時に強制する。
 */
export type EdgeHierarchyDirection = "from-is-child" | "from-is-parent" | "symmetric"

export const EDGE_HIERARCHY_DIRECTION: Record<EdgeKind, EdgeHierarchyDirection> = {
  addresses: "from-is-child",
  supports: "from-is-child",
  attacks: "from-is-child",
  "sub-issue-of": "from-is-child",
  "evaluates-by": "from-is-parent",
  cites: "from-is-parent",
  "alternative-to": "symmetric",
}

/**
 * ユーザーが手動で描いたエッジ（visual: source → target）を、
 * スキーマに格納すべき方向（kind の意味に合わせた from → to）に変換する。
 *
 * - `from-is-child`: visual の上→下 (= parent→child) を反転して保存 (from=child)
 * - `from-is-parent` / `symmetric`: visual の方向をそのまま保存
 */
export function resolveManualConnection(
  visualSource: string,
  visualTarget: string,
  kind: EdgeKind,
): { from: string; to: string } {
  if (EDGE_HIERARCHY_DIRECTION[kind] === "from-is-child") {
    return { from: visualTarget, to: visualSource }
  }
  return { from: visualSource, to: visualTarget }
}

export function graphToFlowEdges(
  graph: Graph,
  selectedEdgeIds: ReadonlySet<string> = new Set(),
): RFEdge[] {
  // alternative-to edge を左右 handle に接続するために Claim の x 座標を引く map
  //
  const claimXById = new Map<string, number>()
  for (const c of graph.claims) {
    if (c.position?.x !== undefined) claimXById.set(c.id, c.position.x)
  }

  return graph.edges.map((e) => {
    // from-is-child のみ visual で反転 (親→子 描画にするため)。
    // from-is-parent と symmetric は保存方向 = 描画方向。
    const reverse = EDGE_HIERARCHY_DIRECTION[e.kind] === "from-is-child"
    const selected = selectedEdgeIds.has(e.id)
    const base: RFEdge = {
      id: e.id,
      source: reverse ? e.to : e.from,
      target: reverse ? e.from : e.to,
      label: e.kind,
      data: { kind: e.kind },
      style: edgeStyleByKind(e.kind, selected),
      animated: e.kind === "attacks",
      selected,
    }

    // alternative-to は同階層の Claim 間で発生するので、x 座標を比較して
    // 左にある Claim の右 handle ↔ 右にある Claim の左 handle で結ぶ。
    // 座標未取得時 (初回 render 等) は default として right→left を仮置きする
    // (React Flow に "Couldn't create edge for source handle id" の警告を出させない)。
    if (e.kind === "alternative-to") {
      const sourceX = claimXById.get(base.source)
      const targetX = claimXById.get(base.target)
      const sourceIsLeft = sourceX === undefined || targetX === undefined || sourceX <= targetX
      if (sourceIsLeft) {
        base.sourceHandle = "alt-right-source"
        base.targetHandle = "alt-left-target"
      } else {
        base.sourceHandle = "alt-left-source"
        base.targetHandle = "alt-right-target"
      }
    }

    return base
  })
}

const EDGE_STROKE_WIDTH = 2
const EDGE_STROKE_WIDTH_SELECTED = 3.5

function edgeStyleByKind(kind: string, selected = false) {
  const w = selected ? EDGE_STROKE_WIDTH_SELECTED : EDGE_STROKE_WIDTH
  switch (kind) {
    case "supports":
      return {
        stroke: selected ? "var(--accent-success-strong)" : "var(--accent-success)",
        strokeWidth: w,
      }
    case "attacks":
      return {
        stroke: selected ? "var(--accent-danger-strong)" : "var(--accent-danger)",
        strokeWidth: w,
      }
    case "addresses":
      return {
        stroke: selected ? "var(--accent-info-strong)" : "var(--accent-info)",
        strokeWidth: w,
        strokeDasharray: "5,3",
      }
    case "evaluates-by":
      return {
        stroke: selected ? "var(--accent-warning-strong)" : "var(--accent-warning)",
        strokeWidth: w,
        strokeDasharray: "2,2",
      }
    case "alternative-to":
      // 対称関係なので方向ニュートラルな表現。Mauve 系で他と区別 +
      // 短破線で「補助的なメタ関係」感を出す
      return {
        stroke: selected ? "var(--accent-special-strong)" : "var(--accent-special)",
        strokeWidth: w,
        strokeDasharray: "3,3",
      }
    default:
      return {
        stroke: selected ? "var(--text-primary)" : "var(--text-secondary)",
        strokeWidth: w,
      }
  }
}
