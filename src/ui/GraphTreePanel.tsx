import { useMemo } from "react"
import type { ArgumentNode, ClaimNode, ClaimStatus, Graph, IssueNode, IssueStatus } from "../schema"

/**
 * グラフの階層構造（Issue → Claim → Argument）をツリー表示するパネル。
 * 選択なし状態の SidePanel に表示し、議論全体の俯瞰とドリルダウンに使う。
 *
 * 主な操作:
 *   - chevron クリック: ノードの展開/折りたたみ
 *   - ラベルクリック: グラフ上のそのノードを中央にスクロール（選択はしない）
 *   - ヘッダー右側のアイコン: 全展開 / 全折りたたみ
 *
 * 展開/折りたたみ・ナビゲーションは SidePanel 側のハンドラに委譲する
 * （このコンポーネントはグラフ store にも UI store にも直接アクセスしない）。
 */

type NodeKindForTree = "issue" | "claim" | "argument" | "orphan-group"

interface TreeItem {
  id: string
  type: NodeKindForTree
  label: string
  badge?: { text: string; color: string }
  children: TreeItem[]
}

interface Props {
  graph: Graph
  /** 「展開中」の ID 集合。デフォルトは空（全て折りたたみ）。 */
  expandedIds: ReadonlySet<string>
  onToggle: (id: string) => void
  /** 全展開/全折りたたみ。展開対象 ID は GraphTreePanel が計算して渡す。 */
  onExpandAll: (ids: string[]) => void
  onCollapseAll: () => void
  /** ラベルクリック時の動作。グラフを中央へスクロールするだけで選択はしない。 */
  onNavigate: (nodeId: string) => void
}

const ORPHAN_GROUP_ID = "__orphans__"

const ROW_HEIGHT = 26
const INDENT_PX = 14

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return `${s.slice(0, Math.max(0, n - 1))}…`
}

function issueBadge(issue: IssueNode): TreeItem["badge"] {
  const palette: Record<IssueStatus, string> = {
    open: "var(--accent-info)",
    resolved: "var(--accent-success)",
    deferred: "var(--text-muted)",
  }
  return { text: issue.status, color: palette[issue.status] }
}

function claimBadge(claim: ClaimNode): TreeItem["badge"] {
  const palette: Record<ClaimStatus, string> = {
    agreed: "var(--accent-success)",
    rejected: "var(--accent-danger)",
    unresolved: "var(--accent-warning)",
    "out-of-scope": "var(--text-muted)",
  }
  return { text: claim.status, color: palette[claim.status] }
}

function argLabel(arg: ArgumentNode): string {
  return arg.data[0] ?? "(根拠未入力)"
}

function argBadge(arg: ArgumentNode): TreeItem["badge"] {
  return arg.kind === "pro"
    ? { text: "pro", color: "var(--accent-success)" }
    : { text: "con", color: "var(--accent-danger)" }
}

export function buildGraphTree(graph: Graph): TreeItem[] {
  // 親子関係を edges から逆引き
  const claimsByIssue = new Map<string, ClaimNode[]>()
  const argsByClaim = new Map<string, ArgumentNode[]>()
  const subIssuesByParent = new Map<string, IssueNode[]>()
  const claimIdsWithIssue = new Set<string>()
  const argIdsWithClaim = new Set<string>()
  // sub-issue-of の子側 (= 親を持つ Issue)。root 判定で除外する。
  const issuesWithParent = new Set<string>()

  for (const e of graph.edges) {
    if (e.kind === "addresses") {
      // from: claim, to: issue
      const claim = graph.claims.find((c) => c.id === e.from)
      if (claim) {
        const arr = claimsByIssue.get(e.to) ?? []
        arr.push(claim)
        claimsByIssue.set(e.to, arr)
        claimIdsWithIssue.add(claim.id)
      }
    } else if (e.kind === "supports" || e.kind === "attacks") {
      // from: argument, to: claim
      const arg = graph.arguments.find((a) => a.id === e.from)
      if (arg) {
        const arr = argsByClaim.get(e.to) ?? []
        arr.push(arg)
        argsByClaim.set(e.to, arr)
        argIdsWithClaim.add(arg.id)
      }
    } else if (e.kind === "sub-issue-of") {
      // from: sub-issue, to: parent-issue
      const sub = graph.issues.find((i) => i.id === e.from)
      if (sub) {
        const arr = subIssuesByParent.get(e.to) ?? []
        arr.push(sub)
        subIssuesByParent.set(e.to, arr)
        issuesWithParent.add(sub.id)
      }
    }
  }

  const claimToTreeItem = (claim: ClaimNode): TreeItem => ({
    id: claim.id,
    type: "claim",
    label: claim.text,
    badge: claimBadge(claim),
    children: (argsByClaim.get(claim.id) ?? []).map((arg) => ({
      id: arg.id,
      type: "argument",
      label: argLabel(arg),
      badge: argBadge(arg),
      children: [],
    })),
  })

  // Issue は自分の claims + sub-issues を子に持つ。
  // 循環参照 (A→B→A 等) は visiting セットでガードし、leaf 扱いにする。
  const issueToTreeItem = (issue: IssueNode, visiting: Set<string>): TreeItem => {
    if (visiting.has(issue.id)) {
      return {
        id: issue.id,
        type: "issue",
        label: issue.text,
        badge: issueBadge(issue),
        children: [],
      }
    }
    visiting.add(issue.id)
    try {
      const claims = (claimsByIssue.get(issue.id) ?? []).map(claimToTreeItem)
      const subs = (subIssuesByParent.get(issue.id) ?? []).map((s) => issueToTreeItem(s, visiting))
      // Claim を先に出して立場を把握しやすくし、その後 sub-issue でドリルダウン
      return {
        id: issue.id,
        type: "issue",
        label: issue.text,
        badge: issueBadge(issue),
        children: [...claims, ...subs],
      }
    } finally {
      visiting.delete(issue.id)
    }
  }

  // root Issue (親を持たない Issue) だけを top-level にする。
  // サブ Issue は親の再帰内で展開される。
  const rootIssues = graph.issues.filter((i) => !issuesWithParent.has(i.id))
  const issueTrees: TreeItem[] = rootIssues.map((i) => issueToTreeItem(i, new Set()))

  // どの Issue にも紐付かない claim / argument を「未配置」グループに集める
  const orphanClaims = graph.claims.filter((c) => !claimIdsWithIssue.has(c.id))
  const orphanArguments = graph.arguments.filter((a) => !argIdsWithClaim.has(a.id))

  if (orphanClaims.length === 0 && orphanArguments.length === 0) {
    return issueTrees
  }

  const orphanChildren: TreeItem[] = [
    ...orphanClaims.map(claimToTreeItem),
    ...orphanArguments.map((arg) => ({
      id: arg.id,
      type: "argument" as const,
      label: argLabel(arg),
      badge: argBadge(arg),
      children: [],
    })),
  ]

  const orphanGroup: TreeItem = {
    id: ORPHAN_GROUP_ID,
    type: "orphan-group",
    label: `未配置のノード (${orphanChildren.length})`,
    children: orphanChildren,
  }

  return [...issueTrees, orphanGroup]
}

const containerStyle: React.CSSProperties = {
  marginTop: 16,
  borderTop: "1px solid var(--border-subtle)",
  paddingTop: 12,
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 4,
  marginBottom: 4,
}

const emptyStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontStyle: "italic",
  fontSize: 12,
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 2,
  minHeight: ROW_HEIGHT,
}

const chevronStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  padding: 0,
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--text-muted)",
  fontSize: 9,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
}

const chevronPlaceholderStyle: React.CSSProperties = {
  width: 16,
  flexShrink: 0,
}

const labelButtonStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  textAlign: "left",
  background: "none",
  border: "none",
  padding: "3px 4px",
  borderRadius: 3,
  cursor: "pointer",
  fontSize: 12,
  color: "var(--text-primary)",
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontFamily: "inherit",
}

const badgeBaseStyle: React.CSSProperties = {
  fontSize: 9,
  padding: "1px 5px",
  borderRadius: 8,
  color: "var(--text-on-accent)",
  fontWeight: 500,
  flexShrink: 0,
  textTransform: "uppercase",
  letterSpacing: 0.3,
}

const orphanLabelStyle: React.CSSProperties = {
  flex: 1,
  textAlign: "left",
  padding: "3px 4px",
  fontSize: 11,
  color: "var(--text-muted)",
}

function TreeRow({
  item,
  depth,
  expandedIds,
  onToggle,
  onNavigate,
}: {
  item: TreeItem
  depth: number
  expandedIds: ReadonlySet<string>
  onToggle: (id: string) => void
  onNavigate: (id: string) => void
}) {
  const hasChildren = item.children.length > 0
  const isExpanded = expandedIds.has(item.id)
  const isOrphanGroup = item.type === "orphan-group"

  return (
    <div>
      <div style={{ ...rowStyle, paddingLeft: depth * INDENT_PX }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(item.id)}
            style={chevronStyle}
            aria-label={isExpanded ? "折りたたむ" : "展開する"}
          >
            {isExpanded ? "▼" : "▶"}
          </button>
        ) : (
          <span style={chevronPlaceholderStyle} />
        )}
        {isOrphanGroup ? (
          <span style={orphanLabelStyle}>{item.label}</span>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate(item.id)}
            style={labelButtonStyle}
            title={`${item.label}（クリックでグラフを中央へ）`}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--surface-info-soft)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent"
            }}
          >
            {item.badge && (
              <span style={{ ...badgeBaseStyle, background: item.badge.color }}>
                {item.badge.text}
              </span>
            )}
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {truncate(item.label, 80)}
            </span>
          </button>
        )}
      </div>
      {hasChildren && isExpanded && (
        <div>
          {item.children.map((child) => (
            <TreeRow
              key={child.id}
              item={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function collectExpandableIds(trees: TreeItem[]): string[] {
  const out: string[] = []
  const visit = (item: TreeItem) => {
    if (item.children.length > 0) {
      out.push(item.id)
      for (const child of item.children) visit(child)
    }
  }
  for (const tree of trees) visit(tree)
  return out
}

const iconButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 2,
  margin: 0,
  cursor: "pointer",
  color: "var(--text-secondary)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 3,
  width: 22,
  height: 22,
}

function ExpandAllIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M3 4 L8 8 L13 4"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 9 L8 13 L13 9"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CollapseAllIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M3 7 L8 3 L13 7"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 12 L8 8 L13 12"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function GraphTreePanel({
  graph,
  expandedIds,
  onToggle,
  onExpandAll,
  onCollapseAll,
  onNavigate,
}: Props) {
  const trees = useMemo(() => buildGraphTree(graph), [graph])
  const expandableIds = useMemo(() => collectExpandableIds(trees), [trees])

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <button
          type="button"
          onClick={() => onExpandAll(expandableIds)}
          style={iconButtonStyle}
          title="全て展開"
          aria-label="全て展開"
          disabled={expandableIds.length === 0}
          onMouseEnter={(e) => {
            if (!e.currentTarget.disabled) e.currentTarget.style.background = "var(--surface-hover)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent"
          }}
        >
          <ExpandAllIcon />
        </button>
        <button
          type="button"
          onClick={onCollapseAll}
          style={iconButtonStyle}
          title="全て折りたたむ"
          aria-label="全て折りたたむ"
          disabled={expandedIds.size === 0}
          onMouseEnter={(e) => {
            if (!e.currentTarget.disabled) e.currentTarget.style.background = "var(--surface-hover)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent"
          }}
        >
          <CollapseAllIcon />
        </button>
      </div>
      {trees.length === 0 ? (
        <div style={emptyStyle}>議題がまだ作成されていません</div>
      ) : (
        trees.map((tree) => (
          <TreeRow
            key={tree.id}
            item={tree}
            depth={0}
            expandedIds={expandedIds}
            onToggle={onToggle}
            onNavigate={onNavigate}
          />
        ))
      )}
    </div>
  )
}
