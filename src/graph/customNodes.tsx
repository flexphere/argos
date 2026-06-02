import { Handle, type NodeProps, Position } from "@xyflow/react"
import type {
  ArgumentNode as ArgumentData,
  ClaimNode as ClaimData,
  ClaimStatus,
  CriterionNode as CriterionData,
  IssueNode as IssueData,
  IssueStatus,
  ReferenceNode as ReferenceData,
  Signal,
} from "../schema"
import { SIGNAL_META } from "../signals"
import { useGraphStore } from "../store/graphStore"
import { EditableText } from "./EditableText"

interface NodeDataWithSignals {
  _signals?: Signal[]
}

function SignalBadges({ signals }: { signals?: Signal[] }) {
  if (!signals || signals.length === 0) return null
  const seen = new Set<string>()
  const unique = signals.filter((s) => {
    if (seen.has(s.kind)) return false
    seen.add(s.kind)
    return true
  })
  return (
    <>
      {unique.map((s) => {
        const meta = SIGNAL_META[s.kind]
        const isWarn = meta.severity === "warn"
        return (
          <span
            key={s.kind}
            title={meta.label}
            style={{
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 10,
              background: isWarn ? "var(--signal-badge-warn-bg)" : "var(--signal-badge-info-bg)",
              color: isWarn ? "var(--signal-badge-warn-text)" : "var(--signal-badge-info-text)",
            }}
          >
            {meta.icon} {meta.label}
          </span>
        )
      })}
    </>
  )
}

const baseNode: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "2px solid var(--border-strong)",
  background: "var(--surface-elevated)",
  color: "var(--text-primary)",
  minWidth: 140,
  maxWidth: 240,
  fontSize: 13,
  fontFamily: "system-ui, sans-serif",
}

const typeLabel: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 4,
}

const badgeRow: React.CSSProperties = {
  display: "flex",
  gap: 4,
  marginTop: 6,
  flexWrap: "wrap",
}

const badge: React.CSSProperties = {
  fontSize: 10,
  padding: "1px 6px",
  borderRadius: 10,
  background: "var(--node-badge-bg)",
  color: "var(--node-badge-text)",
}

// ステータスバッジは GraphTreePanel と同じ accent カラーを背景にする。
// 文字は accent 上の対比色（テーマに応じて白 or 暗色）。
function issueStatusBg(status: IssueStatus): string {
  switch (status) {
    case "open":
      return "var(--accent-info)"
    case "resolved":
      return "var(--accent-success)"
    case "deferred":
      return "var(--text-muted)"
  }
}

function claimStatusBg(status: ClaimStatus): string {
  switch (status) {
    case "agreed":
      return "var(--accent-success)"
    case "rejected":
      return "var(--accent-danger)"
    case "unresolved":
      return "var(--accent-warning)"
    case "out-of-scope":
      return "var(--text-muted)"
  }
}

const statusBadgeBase: React.CSSProperties = {
  ...badge,
  color: "var(--text-on-accent)",
  fontWeight: 500,
}

export function IssueNodeView({ data, selected }: NodeProps) {
  const d = data as unknown as IssueData & NodeDataWithSignals
  const updateNode = useGraphStore((s) => s.updateNode)
  return (
    <div
      style={{
        ...baseNode,
        background: "var(--node-issue-bg)",
        borderColor: selected ? "var(--node-issue-border-selected)" : "var(--node-issue-border)",
      }}
    >
      <div style={typeLabel}>議題</div>
      <EditableText value={d.text} onCommit={(text) => updateNode(d.id, { text })} />
      <div style={badgeRow}>
        <span style={{ ...statusBadgeBase, background: issueStatusBg(d.status) }}>{d.status}</span>
        <SignalBadges signals={d._signals} />
      </div>
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Top} />
    </div>
  )
}

export function ClaimNodeView({ data, selected }: NodeProps) {
  const d = data as unknown as ClaimData & NodeDataWithSignals
  const updateNode = useGraphStore((s) => s.updateNode)
  return (
    <div
      style={{
        ...baseNode,
        background: "var(--node-claim-bg)",
        borderColor: selected ? "var(--node-claim-border-selected)" : "var(--node-claim-border)",
      }}
    >
      <div style={typeLabel}>主張</div>
      <EditableText value={d.text} onCommit={(text) => updateNode(d.id, { text })} />
      <div style={badgeRow}>
        <span style={{ ...statusBadgeBase, background: claimStatusBg(d.status) }}>{d.status}</span>
        <span style={badge}>確信:{d.confidence}</span>
        <SignalBadges signals={d._signals} />
      </div>
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Top} />
      {/*
: alternative-to edge は同階層 (横並び) の Claim 間で発生するため
        左右にも source/target を備える。conversion.ts が x 座標を比較して
        right→left の組合せを動的に指定する。
      */}
      <Handle type="source" position={Position.Left} id="alt-left-source" />
      <Handle type="target" position={Position.Left} id="alt-left-target" />
      <Handle type="source" position={Position.Right} id="alt-right-source" />
      <Handle type="target" position={Position.Right} id="alt-right-target" />
    </div>
  )
}

export function ArgumentNodeView({ data, selected }: NodeProps) {
  const d = data as unknown as ArgumentData & NodeDataWithSignals
  const updateNode = useGraphStore((s) => s.updateNode)
  const isPro = d.kind === "pro"

  const displayText = d.data[0] ?? ""

  return (
    <div
      style={{
        ...baseNode,
        background: isPro ? "var(--node-arg-pro-bg)" : "var(--node-arg-con-bg)",
        borderColor: selected
          ? isPro
            ? "var(--node-arg-pro-border-selected)"
            : "var(--node-arg-con-border-selected)"
          : isPro
            ? "var(--node-arg-pro-border)"
            : "var(--node-arg-con-border)",
        borderStyle: d.scope === "exception" ? "dashed" : "solid",
      }}
    >
      <div style={typeLabel}>{isPro ? "Pro 論証" : "Con 論証"}</div>
      <EditableText
        value={displayText}
        placeholder="(根拠未入力)"
        onCommit={(text) => updateNode(d.id, { data: [text] })}
      />

      <div style={badgeRow}>
        <SignalBadges signals={d._signals} />
      </div>
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Top} />
    </div>
  )
}

export function CriterionNodeView({ data, selected }: NodeProps) {
  const d = data as unknown as CriterionData & NodeDataWithSignals
  const updateNode = useGraphStore((s) => s.updateNode)
  return (
    <div
      style={{
        ...baseNode,
        background: "var(--node-criterion-bg)",
        borderColor: selected
          ? "var(--node-criterion-border-selected)"
          : "var(--node-criterion-border)",
        borderStyle: "dashed",
      }}
    >
      <div style={typeLabel}>評価基準</div>
      <EditableText value={d.text} onCommit={(text) => updateNode(d.id, { text })} />
      <div style={badgeRow}>
        {d.weight && <span style={badge}>重み:{d.weight}</span>}
        <SignalBadges signals={d._signals} />
      </div>
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Top} />
    </div>
  )
}

export function ReferenceNodeView({ data, selected }: NodeProps) {
  const d = data as unknown as ReferenceData & NodeDataWithSignals
  const updateNode = useGraphStore((s) => s.updateNode)
  return (
    <div
      style={{
        ...baseNode,
        background: "var(--node-reference-bg)",
        borderColor: selected
          ? "var(--node-reference-border-selected)"
          : "var(--node-reference-border)",
      }}
    >
      <div style={typeLabel}>参照</div>
      <EditableText
        value={d.title}
        multiline={false}
        onCommit={(title) => updateNode(d.id, { title })}
      />
      {d.uri && (
        <div style={{ ...badgeRow, fontSize: 10, color: "var(--accent-info)" }}>{d.uri}</div>
      )}
      <div style={badgeRow}>
        <SignalBadges signals={d._signals} />
      </div>
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Top} />
    </div>
  )
}

export const nodeTypes = {
  issue: IssueNodeView,
  claim: ClaimNodeView,
  argument: ArgumentNodeView,
  criterion: CriterionNodeView,
  reference: ReferenceNodeView,
}
