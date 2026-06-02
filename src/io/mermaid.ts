import { EDGE_HIERARCHY_DIRECTION } from "../graph/conversion"
import type {
  ArgumentNode,
  ClaimNode,
  ClaimStatus,
  CriterionNode,
  Edge,
  EdgeKind,
  Graph,
  IssueNode,
  ReferenceNode,
} from "../schema"

const CLAIM_STATUS_CLASS: Record<ClaimStatus, string> = {
  agreed: "agreed",
  rejected: "rejected",
  unresolved: "unresolved",
  "out-of-scope": "outOfScope",
}

function arrowFor(kind: EdgeKind): string {
  switch (kind) {
    case "supports":
      return "-->"
    case "attacks":
      return "==>"
    case "addresses":
      return "-.->"
    case "evaluates-by":
      return "-..->"
    case "cites":
      return "-.->"
    case "sub-issue-of":
      return "-->"
    default:
      return "-->"
  }
}

function escapeLabel(text: string): string {
  return text.replace(/"/g, "'").replace(/\n/g, " ")
}

function argumentText(n: ArgumentNode): string {
  return n.data[0] ?? "(根拠未入力)"
}

export function graphToMermaid(graph: Graph): string {
  const aliases = new Map<string, string>()
  let aliasCounter = 0
  const alias = (id: string) => {
    let a = aliases.get(id)
    if (!a) {
      aliasCounter++
      a = `n${aliasCounter}`
      aliases.set(id, a)
    }
    return a
  }

  // ── 関係マップ ──
  const claimsByIssue = new Map<string, string[]>()
  const orphanClaims: string[] = []
  for (const c of graph.claims) {
    const e = graph.edges.find((x) => x.kind === "addresses" && x.from === c.id)
    if (e) {
      const arr = claimsByIssue.get(e.to) ?? []
      arr.push(c.id)
      claimsByIssue.set(e.to, arr)
    } else {
      orphanClaims.push(c.id)
    }
  }

  const argsByClaim = new Map<string, string[]>()
  const orphanArgs: string[] = []
  for (const a of graph.arguments) {
    const e = graph.edges.find(
      (x) => (x.kind === "supports" || x.kind === "attacks") && x.from === a.id,
    )
    if (e) {
      const arr = argsByClaim.get(e.to) ?? []
      arr.push(a.id)
      argsByClaim.set(e.to, arr)
    } else {
      orphanArgs.push(a.id)
    }
  }

  // ── 宣言ヘルパー ──
  const claimByid = new Map(graph.claims.map((n) => [n.id, n] as const))
  const argByid = new Map(graph.arguments.map((n) => [n.id, n] as const))

  const declIssue = (n: IssueNode): string =>
    `        ${alias(n.id)}["${escapeLabel(`Issue: ${n.text}`)}"]`
  const declClaim = (n: ClaimNode): string => {
    const cls = CLAIM_STATUS_CLASS[n.status]
    return `        ${alias(n.id)}(["${escapeLabel(`Claim: ${n.text}`)}"]):::${cls}`
  }
  const declArg = (n: ArgumentNode): string => {
    const kindLabel = n.kind === "pro" ? "Pro" : "Con"
    return `        ${alias(n.id)}>"${escapeLabel(`${kindLabel}: ${argumentText(n)}`)}"]`
  }

  const renderEdge = (e: Edge, indent: string): string | null => {
    // from-is-child のみ Mermaid 表示時に反転 (親→子 描画)。
    // from-is-parent と symmetric は保存方向 = 描画方向。
    const reverse = EDGE_HIERARCHY_DIRECTION[e.kind] === "from-is-child"
    const fromAlias = aliases.get(reverse ? e.to : e.from)
    const toAlias = aliases.get(reverse ? e.from : e.to)
    if (!fromAlias || !toAlias) return null
    return `${indent}${fromAlias} ${arrowFor(e.kind)}|${e.kind}| ${toAlias}`
  }

  // ── 出力組み立て ──
  const lines: string[] = ["graph TD"]
  const renderedEdgeIds = new Set<string>()
  const subgraphIds: string[] = []
  let subgCounter = 0

  // 1) 各 Issue を subgraph で囲む
  for (const issue of graph.issues) {
    subgCounter++
    const subgId = `s${subgCounter}`
    subgraphIds.push(subgId)
    lines.push(`    subgraph ${subgId} [" "]`)
    lines.push("        direction TB")
    lines.push(declIssue(issue))

    const claimIds = claimsByIssue.get(issue.id) ?? []
    for (const cid of claimIds) {
      const c = claimByid.get(cid)
      if (c) lines.push(declClaim(c))
      const argIds = argsByClaim.get(cid) ?? []
      for (const aid of argIds) {
        const a = argByid.get(aid)
        if (a) lines.push(declArg(a))
      }
    }

    // この subgraph 内の階層エッジを描画
    for (const cid of claimIds) {
      const addr = graph.edges.find(
        (e) => e.kind === "addresses" && e.from === cid && e.to === issue.id,
      )
      if (addr) {
        const line = renderEdge(addr, "        ")
        if (line) {
          lines.push(line)
          renderedEdgeIds.add(addr.id)
        }
      }
      const argIds = argsByClaim.get(cid) ?? []
      for (const aid of argIds) {
        const argEdge = graph.edges.find(
          (e) => (e.kind === "supports" || e.kind === "attacks") && e.from === aid && e.to === cid,
        )
        if (argEdge) {
          const line = renderEdge(argEdge, "        ")
          if (line) {
            lines.push(line)
            renderedEdgeIds.add(argEdge.id)
          }
        }
      }
    }
    lines.push("    end")
  }

  // 2) orphan claim は単独の subgraph に
  for (const cid of orphanClaims) {
    subgCounter++
    const subgId = `s${subgCounter}`
    subgraphIds.push(subgId)
    lines.push(`    subgraph ${subgId} [" "]`)
    lines.push("        direction TB")
    const c = claimByid.get(cid)
    if (c) lines.push(declClaim(c))
    const argIds = argsByClaim.get(cid) ?? []
    for (const aid of argIds) {
      const a = argByid.get(aid)
      if (a) lines.push(declArg(a))
      const argEdge = graph.edges.find(
        (e) => (e.kind === "supports" || e.kind === "attacks") && e.from === aid && e.to === cid,
      )
      if (argEdge) {
        const line = renderEdge(argEdge, "        ")
        if (line) {
          lines.push(line)
          renderedEdgeIds.add(argEdge.id)
        }
      }
    }
    lines.push("    end")
  }

  // 3) orphan argument（subgraph 外）
  for (const aid of orphanArgs) {
    const a = argByid.get(aid)
    if (a) lines.push(declArg(a).replace(/^ {8}/, "    "))
  }

  // 4) Criterion / Reference（subgraph 外）
  for (const n of graph.criteria as CriterionNode[]) {
    lines.push(`    ${alias(n.id)}{{"${escapeLabel(`Criterion: ${n.text}`)}"}}`)
  }
  for (const n of graph.references as ReferenceNode[]) {
    lines.push(`    ${alias(n.id)}[("${escapeLabel(`Ref: ${n.title}`)}")]`)
  }

  // 5) subgraph に入らなかったエッジ（evaluates-by, cites など）
  for (const e of graph.edges as Edge[]) {
    if (renderedEdgeIds.has(e.id)) continue
    const line = renderEdge(e, "    ")
    if (line) lines.push(line)
  }

  // 6) subgraph 同士を invisible link で縦に並べる
  for (let k = 0; k < subgraphIds.length - 1; k++) {
    lines.push(`    ${subgraphIds[k]} ~~~ ${subgraphIds[k + 1]}`)
  }

  // 7) クラス定義
  lines.push("")
  lines.push("    classDef agreed fill:#E8F5E9,stroke:#2E7D32")
  lines.push("    classDef rejected fill:#FFEBEE,stroke:#C62828")
  lines.push("    classDef unresolved fill:#FFFDE7,stroke:#F9A825")
  lines.push("    classDef outOfScope fill:#ECEFF1,stroke:#546E7A")

  return lines.join("\n")
}
