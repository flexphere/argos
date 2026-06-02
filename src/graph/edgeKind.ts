import type { ArgumentNode, EdgeKind } from "../schema"
import type { NodeType } from "../store/graphStore"

export interface NodeRef {
  id: string
  type: NodeType
  /** Argument の pro/con。Argument 以外では undefined。 */
  argKind?: "pro" | "con"
  /**
   * Claim が addresses している Issue id の集合。
   * resolveConnection で Claim ↔ Claim の alternative-to 接続時に共通 Issue
   * 制約を判定するために使う。Claim 以外では undefined。
   */
  addressedIssues?: ReadonlySet<string>
}

export interface ResolvedConnection {
  kind: EdgeKind
  /** スキーマ上の保存方向 from（kind の意味的な「主体」側） */
  from: string
  /** スキーマ上の保存方向 to（kind の意味的な「対象」側） */
  to: string
}

/**
 * 順不同ペア (type の集合) → 正規方向の EdgeKind を決定する規則。
 *
 * 接続を作るときは `resolveConnection(a, b)` を呼ぶ。a/b の順序に関係なく、
 * そのノード型ペアにとって意味的に正しい方向に `{from, to}` を組み立てて返す。
 *
 * 未対応のペアは `null` を返す ＝ 接続不可。
 */
export function resolveConnection(a: NodeRef, b: NodeRef): ResolvedConnection | null {
  // 自分自身への接続は不可
  if (a.id === b.id) return null

  // pair key を順序に依存しない形で作る（ソートしたタプル）
  const types = [a.type, b.type].sort() as [NodeType, NodeType]
  const key = `${types[0]}+${types[1]}` as const

  // helper: a または b のうち、指定された type の方を返す
  const pick = (t: NodeType): NodeRef => (a.type === t ? a : b)

  switch (key) {
    case "claim+claim": {
      // 同一 Issue を addressing している Claim 同士のみ alternative-to を許可
      // (代替案 という概念が同じ問いに対する選択肢を意味するため、共通 Issue 制約は意味的に重要)
      const aIssues = a.addressedIssues
      const bIssues = b.addressedIssues
      if (!aIssues || !bIssues) return null
      const hasCommon = [...aIssues].some((i) => bIssues.has(i))
      if (!hasCommon) return null
      // canonical 方向: ref 辞書順小さい方を from に
      const [fromId, toId] = a.id < b.id ? [a.id, b.id] : [b.id, a.id]
      return { kind: "alternative-to", from: fromId, to: toId }
    }

    case "issue+issue":
      // sub-issue-of: from が下位、to が上位。順序を区別できないので
      // ユーザが描いた方向（a→b）をそのまま採用。
      return { kind: "sub-issue-of", from: a.id, to: b.id }

    case "claim+issue":
    case "issue+claim": {
      const claim = pick("claim")
      const issue = pick("issue")
      return { kind: "addresses", from: claim.id, to: issue.id }
    }

    case "argument+claim":
    case "claim+argument": {
      const arg = pick("argument")
      const claim = pick("claim")
      const kind: EdgeKind = arg.argKind === "con" ? "attacks" : "supports"
      return { kind, from: arg.id, to: claim.id }
    }

    case "claim+criterion":
    case "criterion+claim": {
      const criterion = pick("criterion")
      const claim = pick("claim")
      // 正準方向: 主体(評価される側=Claim) → 対象(Criterion)。
      // Criterion は葉として from の直下に置かれる (conversion.ts 参照)。
      return { kind: "evaluates-by", from: claim.id, to: criterion.id }
    }

    case "issue+reference":
    case "reference+issue":
    case "claim+reference":
    case "reference+claim":
    case "argument+reference":
    case "reference+argument":
    case "criterion+reference":
    case "reference+criterion": {
      const ref = pick("reference")
      const other = a.type === "reference" ? b : a
      // 正準方向: 主体(引用する側=other) → 対象(Reference)。
      // Reference は葉として from の直下に置かれる (conversion.ts 参照)。
      return { kind: "cites", from: other.id, to: ref.id }
    }

    // 以下は禁止ペア。null を返して接続不可を通知する。
    // claim+claim, argument+argument, criterion+criterion, reference+reference,
    // issue+argument, issue+criterion, argument+criterion
    default:
      return null
  }
}

/**
 * Graph から node id でノード参照を引く（NodeRef を組み立てる）。
 * Claim の場合は addressedIssues を埋めて alternative-to 接続の判定に使えるようにする。
 */
export function lookupNodeRef(
  graph: {
    issues: { id: string }[]
    claims: { id: string }[]
    arguments: ArgumentNode[]
    criteria: { id: string }[]
    references: { id: string }[]
    edges: { kind: string; from: string; to: string }[]
  },
  id: string,
): NodeRef | null {
  if (graph.issues.some((n) => n.id === id)) return { id, type: "issue" }
  if (graph.claims.some((n) => n.id === id)) {
    // Claim が addresses している Issue 集合
    const addressedIssues = new Set(
      graph.edges.filter((e) => e.kind === "addresses" && e.from === id).map((e) => e.to),
    )
    return { id, type: "claim", addressedIssues }
  }
  const arg = graph.arguments.find((n) => n.id === id)
  if (arg) return { id, type: "argument", argKind: arg.kind }
  if (graph.criteria.some((n) => n.id === id)) return { id, type: "criterion" }
  if (graph.references.some((n) => n.id === id)) return { id, type: "reference" }
  return null
}
