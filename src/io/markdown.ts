import type { ArgumentNode, ClaimNode, ClaimStatus, Graph } from "../schema"
import { graphToMermaid } from "./mermaid"

const STATUS_ICON: Record<ClaimStatus, string> = {
  agreed: "✅",
  rejected: "❌",
  unresolved: "🟡",
  "out-of-scope": "⚪",
}

function argumentText(n: ArgumentNode): string {
  return n.data[0] ?? "(根拠未入力)"
}

interface BuildOptions {
  meetingTitle?: string
  date?: string
  participants?: string[]
}

export function graphToMarkdown(graph: Graph, opts: BuildOptions = {}): string {
  const lines: string[] = []
  lines.push(`# 議論: ${opts.meetingTitle ?? "untitled"}`)
  if (opts.date) lines.push(`**日時**: ${opts.date}`)
  if (opts.participants && opts.participants.length > 0) {
    lines.push(`**参加者**: ${opts.participants.join(", ")}`)
  }
  lines.push("")

  // 概要
  const proCount = graph.arguments.filter((a) => a.kind === "pro").length
  const conCount = graph.arguments.filter((a) => a.kind === "con").length
  lines.push("## 概要")
  lines.push(`- 議題: ${graph.issues.length} 件`)
  lines.push(`- 主張: ${graph.claims.length} 件`)
  lines.push(`- 論証: ${graph.arguments.length} 件（Pro ${proCount} / Con ${conCount}）`)
  lines.push(`- 評価基準: ${graph.criteria.length} 件`)
  lines.push(`- 参照: ${graph.references.length} 件`)
  lines.push("")

  // 議論構造（Mermaid 埋め込み）
  lines.push("## 議論構造")
  lines.push("")
  lines.push("```mermaid")
  lines.push(graphToMermaid(graph))
  lines.push("```")
  lines.push("")

  // 議題別の構造
  if (graph.issues.length > 0) {
    lines.push("## 議題別の構造")
    lines.push("")
    for (const issue of graph.issues) {
      lines.push(`### ${issue.text}`)
      lines.push(`**状態**: ${issue.status}`)
      lines.push("")

      const addressingClaimIds = new Set(
        graph.edges.filter((e) => e.kind === "addresses" && e.to === issue.id).map((e) => e.from),
      )
      const relatedClaims = graph.claims.filter((c) => addressingClaimIds.has(c.id))

      if (relatedClaims.length === 0) {
        lines.push("_主張は未提示_")
        lines.push("")
        continue
      }

      lines.push("**主張:**")
      for (const claim of relatedClaims) {
        const icon = STATUS_ICON[claim.status]
        const conf = claim.confidence
        lines.push(`- ${icon} ${claim.text}（${claim.status} / 確信:${conf}）`)

        const proArgs = collectArgumentsFor(graph, claim, "pro")
        const conArgs = collectArgumentsFor(graph, claim, "con")
        for (const a of proArgs) {
          lines.push(`  - **Pro**: ${argumentText(a)}`)
        }
        for (const a of conArgs) {
          lines.push(`  - **Con**: ${argumentText(a)}`)
        }
      }
      lines.push("")
    }
  }

  // 考慮漏れ一覧（暫定: 構造から導出できるもののみ）
  const unsupportedClaims = graph.claims.filter(
    (c) => !graph.edges.some((e) => e.kind === "supports" && e.to === c.id),
  )
  const unansweredAttacks = graph.claims.reduce((sum, c) => sum + (c.unanswered_attacks ?? 0), 0)

  if (unsupportedClaims.length > 0 || unansweredAttacks > 0) {
    lines.push("## 考慮漏れ一覧")
    if (unsupportedClaims.length > 0) {
      lines.push(`- ❗ 未根拠の主張: ${unsupportedClaims.length} 件`)
    }
    if (unansweredAttacks > 0) {
      lines.push(`- ⚠️ 未応答の反論: ${unansweredAttacks} 件`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

function collectArgumentsFor(graph: Graph, claim: ClaimNode, kind: "pro" | "con"): ArgumentNode[] {
  const targetEdgeKind = kind === "pro" ? "supports" : "attacks"
  const argIds = new Set(
    graph.edges.filter((e) => e.kind === targetEdgeKind && e.to === claim.id).map((e) => e.from),
  )
  return graph.arguments.filter((a) => argIds.has(a.id) && a.kind === kind)
}
