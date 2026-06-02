import { useReactFlow } from "@xyflow/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import type {
  ArgumentNode,
  ClaimNode,
  ClaimStatus,
  Confidence,
  CriterionNode,
  Edge,
  Graph,
  IssueNode,
  IssueStatus,
  ReferenceNode,
  SignalKind,
} from "../schema"
import { detectStructuralSignals, signalsForNode } from "../signals"
import { type AnyNode, type NodeType, useGraphStore } from "../store/graphStore"
import { useUIStore } from "../store/uiStore"
import { GraphTreePanel } from "./GraphTreePanel"
import { SignalsSection } from "./SignalsSection"

/**
 * ノード ID から表示ラベルを生成。
 * graph に存在しない ID（LLM が誤った id を返した、ノードが削除済み等）は null。
 */
function labelForNode(graph: Graph, id: string): string | null {
  const issue = graph.issues.find((n) => n.id === id)
  if (issue) return `[議題] ${issue.text}`
  const claim = graph.claims.find((n) => n.id === id)
  if (claim) return `[主張] ${claim.text}`
  const arg = graph.arguments.find((n) => n.id === id)
  if (arg) {
    const text = arg.data[0] ?? "(根拠未入力)"
    return `[${arg.kind === "pro" ? "Pro" : "Con"}] ${text}`
  }
  const crit = graph.criteria.find((n) => n.id === id)
  if (crit) return `[基準] ${crit.text}`
  const ref = graph.references.find((n) => n.id === id)
  if (ref) return `[参照] ${ref.title}`
  return null
}

function findPositionedById(graph: Graph, id: string) {
  for (const arr of [
    graph.issues,
    graph.claims,
    graph.arguments,
    graph.criteria,
    graph.references,
  ]) {
    const n = arr.find((x) => x.id === id)
    if (n) return n
  }
  return undefined
}

const panelStyle: React.CSSProperties = {
  // width はランタイム制御（リサイズハンドル）。デフォルトはユーザーが
  // localStorage に保存した値、なければ 320。
  borderLeft: "1px solid var(--border-subtle)",
  padding: 16,
  overflowY: "auto",
  background: "var(--surface-panel)",
  color: "var(--text-primary)",
  fontFamily: "inherit",
  fontSize: 13,
  position: "relative",
  flexShrink: 0,
}

const SIDE_PANEL_WIDTH_KEY = "argos:sidePanelWidth"
const SIDE_PANEL_WIDTH_DEFAULT = 320
const SIDE_PANEL_WIDTH_MIN = 220
const SIDE_PANEL_WIDTH_MAX = 800

/**
 * クライアント側でのみ localStorage を読む。SSR/client 初回 render の
 * mismatch を避けるため、useState の初期値ではなく mount 後 useEffect で適用する。
 */
function loadStoredWidth(): number {
  if (typeof window === "undefined") return SIDE_PANEL_WIDTH_DEFAULT
  const raw = window.localStorage.getItem(SIDE_PANEL_WIDTH_KEY)
  if (!raw) return SIDE_PANEL_WIDTH_DEFAULT
  const n = Number(raw)
  if (!Number.isFinite(n)) return SIDE_PANEL_WIDTH_DEFAULT
  return Math.max(SIDE_PANEL_WIDTH_MIN, Math.min(SIDE_PANEL_WIDTH_MAX, n))
}

const resizeHandleStyle: React.CSSProperties = {
  position: "absolute",
  left: -3,
  top: 0,
  bottom: 0,
  width: 6,
  cursor: "col-resize",
  // ホバー/ドラッグで色付けするためにクラスは inline ではなく動的に切替
  zIndex: 1,
  touchAction: "none",
}

const fieldStyle: React.CSSProperties = {
  marginBottom: 14,
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-secondary)",
  display: "block",
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: 0.5,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  border: "1px solid var(--border-default)",
  background: "var(--surface-input)",
  color: "var(--text-primary)",
  borderRadius: 3,
  fontSize: 13,
  fontFamily: "inherit",
}

const headerStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 8,
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div style={fieldStyle}>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  )
}

function findInGraph(graph: Graph, id: string): { node: AnyNode; type: NodeType } | null {
  const issue = graph.issues.find((n) => n.id === id)
  if (issue) return { node: issue, type: "issue" }
  const claim = graph.claims.find((n) => n.id === id)
  if (claim) return { node: claim, type: "claim" }
  const arg = graph.arguments.find((n) => n.id === id)
  if (arg) return { node: arg, type: "argument" }
  const cri = graph.criteria.find((n) => n.id === id)
  if (cri) return { node: cri, type: "criterion" }
  const ref = graph.references.find((n) => n.id === id)
  if (ref) return { node: ref, type: "reference" }
  return null
}

/**
 * サイドパネル内の関連ノード click 時に「ノードを選択せず、viewport
 * だけ中央移動」させる挙動を共通化する hook (B 案 / 2026-05-24)。
 *
 * 経緯: signal 経路では既に「中央移動のみ」だったが、関連リンク
 * (代替案 / 評価軸 / 参照 / back-link) は selectNode による選択切替に
 * なっていた。ユーザー要望でこれらを「中央移動のみ」に統一する。
 *
 * グラフが横長になっても (B 案で行ラップ廃止) サイドパネル経由で
 * 任意ノードに到達できることを担保する役割も持つ。
 */
function useNavigateToNode(): (nodeId: string) => void {
  const rf = useReactFlow()
  const graph = useGraphStore((s) => s.graph)
  return useCallback(
    (nodeId: string) => {
      const node = findPositionedById(graph, nodeId)
      if (!node?.position) return
      // 約 NODE_WIDTH/2, NODE_HEIGHT/2 を加算してノード中央へ
      rf.setCenter(node.position.x + 110, node.position.y + 55, {
        zoom: 1.2,
        duration: 500,
      })
    },
    [graph, rf],
  )
}

export function SidePanel() {
  const selectedNodeIds = useUIStore((s) => s.selectedNodeIds)
  const selectedEdgeIds = useUIStore((s) => s.selectedEdgeIds)
  const clearSelection = useUIStore((s) => s.clearSelection)
  const graph = useGraphStore((s) => s.graph)
  const navigateToNode = useNavigateToNode()

  // 幅は localStorage に保存。リサイズ中は state を直接更新、終了時に永続化。
  // SSR / client 初回 render では default を使い、mount 後に localStorage 値を反映する。
  // これで <aside style="width:..."> の hydration mismatch を防ぐ。
  const [panelWidth, setPanelWidth] = useState<number>(SIDE_PANEL_WIDTH_DEFAULT)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 初回マウントのみ
  useEffect(() => {
    const stored = loadStoredWidth()
    if (stored !== panelWidth) setPanelWidth(stored)
  }, [])
  const [isResizing, setIsResizing] = useState(false)
  const [isResizeHover, setIsResizeHover] = useState(false)

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = panelWidth
      let currentWidth = startWidth

      const onMove = (ev: MouseEvent) => {
        // 右サイドパネルなので、左にドラッグするほど幅が増える
        const delta = startX - ev.clientX
        currentWidth = Math.max(
          SIDE_PANEL_WIDTH_MIN,
          Math.min(SIDE_PANEL_WIDTH_MAX, startWidth + delta),
        )
        setPanelWidth(currentWidth)
      }
      const onUp = () => {
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
        document.body.style.userSelect = ""
        document.body.style.cursor = ""
        setIsResizing(false)
        try {
          window.localStorage.setItem(SIDE_PANEL_WIDTH_KEY, String(Math.round(currentWidth)))
        } catch {
          // localStorage 不可の環境（プライベートブラウジング等）は無視
        }
      }

      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
      document.body.style.userSelect = "none"
      document.body.style.cursor = "col-resize"
      setIsResizing(true)
    },
    [panelWidth],
  )

  // アコーディオン展開状態を SidePanel に持つことで、ノード選択／解除でパネルが
  // 切り替わっても保持される
  const [expandedKinds, setExpandedKinds] = useState<Set<SignalKind>>(() => new Set())
  const toggleExpanded = useCallback((kind: SignalKind) => {
    setExpandedKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }, [])

  const allSignals = useMemo(
    () => [...detectStructuralSignals(graph), ...(graph.semantic_signals ?? [])],
    [graph],
  )

  const getNodeLabel = useCallback((id: string): string | null => labelForNode(graph, id), [graph])

  const handleNavigate = navigateToNode

  // ツリーの展開状態を SidePanel が保持。デフォルトは「全て折りたたみ」
  // （空の Set）。シグナルからの onNavigate と同じく、選択は変更せず
  // ビューポートだけ移動する設計のため、ツリーは選択操作で消えない。
  const [expandedTreeIds, setExpandedTreeIds] = useState<Set<string>>(() => new Set())
  const toggleTreeNode = useCallback((id: string) => {
    setExpandedTreeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const expandAllTree = useCallback((ids: string[]) => {
    setExpandedTreeIds(new Set(ids))
  }, [])
  const collapseAllTree = useCallback(() => {
    setExpandedTreeIds(new Set())
  }, [])

  const singleNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null
  const singleEdgeId =
    selectedEdgeIds.length === 1 && selectedNodeIds.length === 0 ? selectedEdgeIds[0] : null

  const foundNode = useGraphStore(
    useShallow((s) => (singleNodeId ? findInGraph(s.graph, singleNodeId) : null)),
  )
  const selectedEdge = useGraphStore(
    useShallow((s) =>
      singleEdgeId ? (s.graph.edges.find((e) => e.id === singleEdgeId) ?? null) : null,
    ),
  )

  // 選択状態に応じた中身を組み立てて、ひとつの <aside> でラップする。
  // <aside> をひとつに集約することで、リサイズハンドルと幅指定が常に
  // 同一ノードに当たり、選択状態が変わってもハンドルが消えない。
  let content: React.ReactNode
  if (foundNode) {
    content = (
      <NodePanel
        node={foundNode.node}
        type={foundNode.type}
        nodeSignals={signalsForNode(allSignals, foundNode.node.id)}
        onClearAfterDelete={clearSelection}
      />
    )
  } else if (selectedEdge) {
    content = <EdgePanel edge={selectedEdge} onClearAfterDelete={clearSelection} />
  } else if (selectedNodeIds.length > 1) {
    content = (
      <>
        <SignalsSection
          signals={allSignals}
          mode="summary"
          getNodeLabel={getNodeLabel}
          onNavigate={handleNavigate}
          expandedKinds={expandedKinds}
          onToggleExpanded={toggleExpanded}
        />
        <div style={headerStyle}>選択中</div>
        <div style={{ marginBottom: 12 }}>
          {selectedNodeIds.length} 件のノードが選択されています
        </div>
        <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
          右クリックで「削除」を実行できます
        </div>
      </>
    )
  } else {
    content = (
      <>
        <SignalsSection
          signals={allSignals}
          mode="summary"
          getNodeLabel={getNodeLabel}
          onNavigate={handleNavigate}
        />
        <GraphTreePanel
          graph={graph}
          expandedIds={expandedTreeIds}
          onToggle={toggleTreeNode}
          onExpandAll={expandAllTree}
          onCollapseAll={collapseAllTree}
          onNavigate={handleNavigate}
        />
      </>
    )
  }

  const handleBackground = isResizing
    ? "var(--accent-info)"
    : isResizeHover
      ? "var(--surface-info)"
      : "transparent"

  return (
    <aside style={{ ...panelStyle, width: panelWidth }}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="サイドパネルの幅を調整"
        aria-valuenow={Math.round(panelWidth)}
        aria-valuemin={SIDE_PANEL_WIDTH_MIN}
        aria-valuemax={SIDE_PANEL_WIDTH_MAX}
        tabIndex={0}
        title="ドラッグで幅を調整"
        onMouseDown={handleResizeStart}
        onMouseEnter={() => setIsResizeHover(true)}
        onMouseLeave={() => setIsResizeHover(false)}
        onKeyDown={(e) => {
          // ← / → / Home / End キーでも調整可能（a11y 配慮）
          const step = e.shiftKey ? 40 : 10
          let next = panelWidth
          if (e.key === "ArrowLeft") next = panelWidth + step
          else if (e.key === "ArrowRight") next = panelWidth - step
          else if (e.key === "Home") next = SIDE_PANEL_WIDTH_MAX
          else if (e.key === "End") next = SIDE_PANEL_WIDTH_MIN
          else return
          e.preventDefault()
          const clamped = Math.max(SIDE_PANEL_WIDTH_MIN, Math.min(SIDE_PANEL_WIDTH_MAX, next))
          setPanelWidth(clamped)
          try {
            window.localStorage.setItem(SIDE_PANEL_WIDTH_KEY, String(Math.round(clamped)))
          } catch {
            // ignore
          }
        }}
        style={{ ...resizeHandleStyle, background: handleBackground }}
      />
      {content}
    </aside>
  )
}

/* ── Node panels ──────────────────────────── */

function NodePanel({
  node,
  type,
  nodeSignals,
  onClearAfterDelete,
}: {
  node: AnyNode
  type: NodeType
  nodeSignals: import("../schema").Signal[]
  onClearAfterDelete: () => void
}) {
  const updateNode = useGraphStore((s) => s.updateNode)
  const deleteNode = useGraphStore((s) => s.deleteNode)
  const dismissDriftSignal = useGraphStore((s) => s.dismissDriftSignal)
  const showConfirm = useUIStore((s) => s.showConfirm)
  const onUpdate = (updates: Record<string, unknown>) => updateNode(node.id, updates)

  const driftSignal =
    type === "claim" ? nodeSignals.find((s) => s.kind === "semantic_drift") : undefined

  const handleDeleteForDrift = async () => {
    const ok = await showConfirm({
      title: "ノードの削除",
      message: "この主張ノードを削除しますか？",
      confirmLabel: "削除",
      danger: true,
    })
    if (ok) {
      deleteNode(node.id)
      onClearAfterDelete()
    }
  }

  return (
    <>
      <div style={headerStyle}>{type}</div>

      {nodeSignals.length > 0 && <SignalsSection signals={nodeSignals} mode="node" />}

      {driftSignal && (
        <div className="warrant-suggestion-box">
          <div className="warrant-suggestion-label">
            <span>🔀</span> 論点ズレの可能性
          </div>
          <div className="warrant-suggestion-text">
            この主張は、対応する議題と内容が乖離していると判定されました。
            内容が議題と合っていない場合は削除、すでに対処済みなら無視を選択してください。
          </div>
          <div className="warrant-suggestion-actions">
            <button type="button" className="btn btn-danger" onClick={handleDeleteForDrift}>
              ノードを削除
            </button>
            <button type="button" className="btn" onClick={() => dismissDriftSignal(node.id)}>
              無視
            </button>
          </div>
        </div>
      )}

      {type === "issue" && <IssuePanel node={node as IssueNode} onUpdate={onUpdate} />}
      {type === "claim" && (
        <ClaimPanel node={node as ClaimNode} onUpdate={onUpdate} nodeSignals={nodeSignals} />
      )}
      {type === "argument" && <ArgumentPanel node={node as ArgumentNode} onUpdate={onUpdate} />}
      {type === "criterion" && <CriterionPanel node={node as CriterionNode} onUpdate={onUpdate} />}
      {type === "reference" && <ReferencePanel node={node as ReferenceNode} onUpdate={onUpdate} />}

      <Field label="ID">
        <code style={{ fontSize: 10, color: "var(--text-muted)" }}>{node.id}</code>
      </Field>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-danger"
          onClick={async () => {
            const ok = await useUIStore.getState().showConfirm({
              title: "ノードの削除",
              message: "このノードを削除しますか？",
              confirmLabel: "削除",
              danger: true,
            })
            if (ok) {
              deleteNode(node.id)
              onClearAfterDelete()
            }
          }}
        >
          削除
        </button>
      </div>
    </>
  )
}

interface PanelProps<T> {
  node: T
  onUpdate: (updates: Record<string, unknown>) => void
}

function IssuePanel({ node, onUpdate }: PanelProps<IssueNode>) {
  const graph = useGraphStore((s) => s.graph)
  const navigateToNode = useNavigateToNode()

  // 親議題 (sub-issue-of: from=this issue 子 → to=parent issue 親)
  const parentIssue = graph.edges
    .filter((e) => e.kind === "sub-issue-of" && e.from === node.id)
    .map((e) => graph.issues.find((i) => i.id === e.to))
    .filter((i): i is IssueNode => Boolean(i))[0]

  // 子議題 (sub-issue-of: from=child → to=this issue 親)
  const subIssues = graph.edges
    .filter((e) => e.kind === "sub-issue-of" && e.to === node.id)
    .map((e) => graph.issues.find((i) => i.id === e.from))
    .filter((i): i is IssueNode => Boolean(i))

  // 主張 (addresses: from=Claim → to=this issue)
  const addressingClaims = graph.edges
    .filter((e) => e.kind === "addresses" && e.to === node.id)
    .map((e) => graph.claims.find((c) => c.id === e.from))
    .filter((c): c is ClaimNode => Boolean(c))

  return (
    <>
      <Field label="text">
        <textarea
          value={node.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          rows={3}
          style={inputStyle}
        />
      </Field>
      <Field label="status">
        <select
          value={node.status}
          onChange={(e) => onUpdate({ status: e.target.value as IssueStatus })}
          style={inputStyle}
        >
          <option value="open">open</option>
          <option value="resolved">resolved</option>
          <option value="deferred">deferred</option>
        </select>
      </Field>

      {parentIssue && (
        <Field label="親議題">
          <button
            type="button"
            onClick={() => navigateToNode(parentIssue.id)}
            style={navListButtonStyle}
            title={`status: ${parentIssue.status}`}
          >
            <span style={{ color: "var(--text-muted)", marginRight: 6 }}>↑</span>
            {truncateText(parentIssue.text, 60)}
          </button>
        </Field>
      )}

      {subIssues.length > 0 && (
        <Field label={`子議題 (${subIssues.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {subIssues.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => navigateToNode(i.id)}
                style={navListButtonStyle}
                title={`status: ${i.status}`}
              >
                <span style={{ color: "var(--text-muted)", marginRight: 6 }}>↓</span>
                {truncateText(i.text, 60)}
              </button>
            ))}
          </div>
        </Field>
      )}

      {addressingClaims.length > 0 && (
        <Field label={`主張 (${addressingClaims.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {addressingClaims.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigateToNode(c.id)}
                style={navListButtonStyle}
                title={`status: ${c.status}`}
              >
                <span style={{ color: "var(--text-muted)", marginRight: 6 }}>[{c.status}]</span>
                {truncateText(c.text, 60)}
              </button>
            ))}
          </div>
        </Field>
      )}
    </>
  )
}

function ClaimPanel({
  node,
  onUpdate,
  nodeSignals,
}: PanelProps<ClaimNode> & { nodeSignals: import("../schema").Signal[] }) {
  const graph = useGraphStore((s) => s.graph)
  const getAlternativesOf = useGraphStore((s) => s.getAlternativesOf)
  const bulkUpdateClaimStatus = useGraphStore((s) => s.bulkUpdateClaimStatus)
  const showConfirm = useUIStore((s) => s.showConfirm)
  const navigateToNode = useNavigateToNode()

  const altIds = getAlternativesOf(node.id)
  const altClaims = altIds
    .map((id) => graph.claims.find((c) => c.id === id))
    .filter((c): c is ClaimNode => Boolean(c))

  const readyToAgree = nodeSignals.some((s) => s.kind === "ready_to_agree")

  // 論点 (addresses: from=this claim → to=issue, 通常 1 件)
  const addressedIssue = graph.edges
    .filter((e) => e.kind === "addresses" && e.from === node.id)
    .map((e) => graph.issues.find((i) => i.id === e.to))
    .filter((i): i is IssueNode => Boolean(i))[0]

  // 支持する論証 (supports: from=argument → to=this claim)
  const supportingArgs = graph.edges
    .filter((e) => e.kind === "supports" && e.to === node.id)
    .map((e) => graph.arguments.find((a) => a.id === e.from))
    .filter((a): a is ArgumentNode => Boolean(a))

  // 反論する論証 (attacks: from=argument → to=this claim)
  const attackingArgs = graph.edges
    .filter((e) => e.kind === "attacks" && e.to === node.id)
    .map((e) => graph.arguments.find((a) => a.id === e.from))
    .filter((a): a is ArgumentNode => Boolean(a))

  // agreed への変更時、unresolved な alt があれば ConfirmDialog で
  // 一括 reject を提案する。
  const handleStatusChange = async (next: ClaimStatus) => {
    if (next !== "agreed") {
      onUpdate({ status: next })
      return
    }
    const rejectable = altClaims.filter((c) => c.status === "unresolved")
    if (rejectable.length === 0) {
      onUpdate({ status: "agreed" })
      return
    }
    // 1 行 1 件で改行表示。pre-wrap で自然な折り返しもされるので長め (80 文字) で許容
    const list = rejectable.map((c) => `• ${truncateText(c.text, 80)}`).join("\n")
    const ok = await showConfirm({
      title: "代替案を rejected にしますか?",
      message: `この主張を採用すると、以下 ${rejectable.length} 件の代替案 (alternative-to で接続) と矛盾します。同時に rejected にしますか？\n\n${list}`,
      confirmLabel: "同時に rejected",
      cancelLabel: "この主張だけ採用",
    })
    // ユーザの選択に関わらず本人は必ず agreed に
    onUpdate({ status: "agreed" })
    if (ok) {
      bulkUpdateClaimStatus(
        rejectable.map((c) => c.id),
        "rejected",
        { onlyIfStatus: "unresolved" },
      )
    }
  }

  return (
    <>
      {readyToAgree && (
        <div className="warrant-suggestion-box">
          <div className="warrant-suggestion-label">
            <span>✅</span> 採用検討の余地あり
          </div>
          <div className="warrant-suggestion-text">
            支持が反論を上回り、未応答の反論もない状態です。agreed への昇格を検討できます。
          </div>
          <div className="warrant-suggestion-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleStatusChange("agreed")}
            >
              agreed に変更
            </button>
          </div>
        </div>
      )}
      <Field label="text">
        <textarea
          value={node.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          rows={3}
          style={inputStyle}
        />
      </Field>
      <Field label="status">
        <select
          value={node.status}
          onChange={(e) => handleStatusChange(e.target.value as ClaimStatus)}
          style={inputStyle}
        >
          <option value="agreed">agreed</option>
          <option value="rejected">rejected</option>
          <option value="unresolved">unresolved</option>
          <option value="out-of-scope">out-of-scope</option>
        </select>
      </Field>
      <Field label="confidence">
        <select
          value={node.confidence}
          onChange={(e) => onUpdate({ confidence: e.target.value as Confidence })}
          style={inputStyle}
        >
          <option value="strong">strong</option>
          <option value="moderate">moderate</option>
          <option value="weak">weak</option>
        </select>
      </Field>

      {addressedIssue && (
        <Field label="論点">
          <button
            type="button"
            onClick={() => navigateToNode(addressedIssue.id)}
            style={navListButtonStyle}
            title={`status: ${addressedIssue.status}`}
          >
            <span style={{ color: "var(--text-muted)", marginRight: 6 }}>↑</span>
            {truncateText(addressedIssue.text, 60)}
          </button>
        </Field>
      )}

      {altClaims.length > 0 && (
        <Field label={`代替案 (${altClaims.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {altClaims.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigateToNode(c.id)}
                style={navListButtonStyle}
                title={`status: ${c.status}`}
              >
                <span style={{ color: "var(--text-muted)", marginRight: 6 }}>[{c.status}]</span>
                {truncateText(c.text, 60)}
              </button>
            ))}
          </div>
        </Field>
      )}

      {supportingArgs.length > 0 && (
        <Field label={`支持する論証 (${supportingArgs.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {supportingArgs.map((a) => {
              const text = a.data[0] ?? "(根拠未入力)"
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => navigateToNode(a.id)}
                  style={navListButtonStyle}
                  title="Pro 論証"
                >
                  <span style={{ color: "var(--accent-success)", marginRight: 6, fontWeight: 600 }}>
                    Pro
                  </span>
                  {truncateText(text, 60)}
                </button>
              )
            })}
          </div>
        </Field>
      )}

      {attackingArgs.length > 0 && (
        <Field label={`反論する論証 (${attackingArgs.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {attackingArgs.map((a) => {
              const text = a.data[0] ?? "(根拠未入力)"
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => navigateToNode(a.id)}
                  style={navListButtonStyle}
                  title="Con 論証"
                >
                  <span style={{ color: "var(--accent-danger)", marginRight: 6, fontWeight: 600 }}>
                    Con
                  </span>
                  {truncateText(text, 60)}
                </button>
              )
            })}
          </div>
        </Field>
      )}
    </>
  )
}

/** SidePanel ローカルの軽量 truncate。GraphTreePanel と同等の挙動。 */
function truncateText(s: string, n: number): string {
  if (s.length <= n) return s
  return `${s.slice(0, Math.max(0, n - 1))}…`
}

function ArgumentPanel({ node, onUpdate }: PanelProps<ArgumentNode>) {
  const dataText = node.data[0] ?? ""

  const reattachArgument = useGraphStore((s) => s.reattachArgument)
  const dismissMisplacement = useGraphStore((s) => s.dismissMisplacementSuggestion)
  const graph = useGraphStore((s) => s.graph)
  const showConfirm = useUIStore((s) => s.showConfirm)
  const navigateToNode = useNavigateToNode()

  // この論証が依拠する Criterion / 引用する Reference
  const evaluatesCriteria = graph.edges
    .filter((e) => e.kind === "evaluates-by" && e.from === node.id)
    .map((e) => graph.criteria.find((c) => c.id === e.to))
    .filter((c): c is CriterionNode => Boolean(c))
  const citedReferences = graph.edges
    .filter((e) => e.kind === "cites" && e.from === node.id)
    .map((e) => graph.references.find((r) => r.id === e.to))
    .filter((r): r is ReferenceNode => Boolean(r))

  // 接続先見直し候補の表示と 1-click 付け替え
  const misplacement = node.misplacement_suggestion
  const candidateClaim = misplacement
    ? graph.claims.find((c) => c.id === misplacement.candidate_claim_id)
    : null
  // 現 target Claim も表示用に取得
  const currentTargetEdge = graph.edges.find(
    (e) => (e.kind === "supports" || e.kind === "attacks") && e.from === node.id,
  )
  const currentTargetClaim = currentTargetEdge
    ? graph.claims.find((c) => c.id === currentTargetEdge.to)
    : null

  const handleReattach = async () => {
    if (!misplacement || !candidateClaim) return
    const ok = await showConfirm({
      title: "Argument を付け替えますか?",
      message: `現在: [${currentTargetEdge?.kind ?? "?"}] 「${truncateText(
        currentTargetClaim?.text ?? "(unknown)",
        40,
      )}」\n推奨: [${misplacement.candidate_kind}] 「${truncateText(candidateClaim.text, 40)}」\n\n理由: ${misplacement.reason}`,
      confirmLabel: "付け替える",
      cancelLabel: "キャンセル",
    })
    if (ok) reattachArgument(node.id, misplacement.candidate_claim_id, misplacement.candidate_kind)
  }

  return (
    <>
      {misplacement && candidateClaim && (
        <div className="warrant-suggestion-box">
          <div className="warrant-suggestion-label">
            <span>✨</span> 接続先見直し候補
          </div>
          <div className="warrant-suggestion-text">
            <div style={{ marginBottom: 4, fontSize: 11, color: "var(--text-secondary)" }}>
              現在: [{currentTargetEdge?.kind ?? "?"}] 「
              {truncateText(currentTargetClaim?.text ?? "(unknown)", 32)}」
            </div>
            <div style={{ marginBottom: 6 }}>
              推奨: [{misplacement.candidate_kind}] 「{truncateText(candidateClaim.text, 32)}」
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              理由: {misplacement.reason}
            </div>
          </div>
          <div className="warrant-suggestion-actions">
            <button type="button" className="btn btn-primary" onClick={handleReattach}>
              ✓ 付け替える
            </button>
            <button type="button" className="btn" onClick={() => dismissMisplacement(node.id)}>
              却下
            </button>
          </div>
        </div>
      )}

      <Field label="kind">
        <select
          value={node.kind}
          onChange={(e) => onUpdate({ kind: e.target.value as "pro" | "con" })}
          style={inputStyle}
        >
          <option value="pro">pro</option>
          <option value="con">con</option>
        </select>
      </Field>

      {node.kind === "con" && (
        <Field label="scope (Con のみ)">
          <select
            value={node.scope ?? "general"}
            onChange={(e) => onUpdate({ scope: e.target.value as "general" | "exception" })}
            style={inputStyle}
          >
            <option value="general">general (全否定)</option>
            <option value="exception">exception (例外指摘)</option>
          </select>
        </Field>
      )}

      <Field label="data (根拠テキスト)">
        <textarea
          value={dataText}
          onChange={(e) => onUpdate({ data: [e.target.value] })}
          rows={2}
          style={inputStyle}
        />
      </Field>

      {currentTargetClaim && currentTargetEdge && (
        <Field label="対象 Claim">
          <button
            type="button"
            onClick={() => navigateToNode(currentTargetClaim.id)}
            style={navListButtonStyle}
            title={`status: ${currentTargetClaim.status}`}
          >
            <span
              style={{
                color:
                  currentTargetEdge.kind === "supports"
                    ? "var(--accent-success)"
                    : "var(--accent-danger)",
                marginRight: 6,
                fontWeight: 600,
              }}
            >
              {currentTargetEdge.kind === "supports" ? "↑Pro" : "↑Con"}
            </span>
            {truncateText(currentTargetClaim.text, 60)}
          </button>
        </Field>
      )}

      {evaluatesCriteria.length > 0 && (
        <Field label={`評価軸 (${evaluatesCriteria.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {evaluatesCriteria.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigateToNode(c.id)}
                style={navListButtonStyle}
                title={c.weight ? `weight: ${c.weight}` : undefined}
              >
                <span style={{ color: "var(--text-muted)", marginRight: 6 }}>⚖️</span>
                {truncateText(c.text, 60)}
              </button>
            ))}
          </div>
        </Field>
      )}

      {citedReferences.length > 0 && (
        <Field label={`参照 (${citedReferences.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {citedReferences.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => navigateToNode(r.id)}
                style={navListButtonStyle}
                title={r.uri ?? undefined}
              >
                <span style={{ color: "var(--text-muted)", marginRight: 6 }}>🔖</span>
                {truncateText(r.title, 60)}
              </button>
            ))}
          </div>
        </Field>
      )}
    </>
  )
}

const navListButtonStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "4px 8px",
  border: "1px solid var(--border-subtle)",
  borderRadius: 4,
  background: "var(--surface-elevated)",
  color: "var(--text-primary)",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "inherit",
}

function CriterionPanel({ node, onUpdate }: PanelProps<CriterionNode>) {
  const graph = useGraphStore((s) => s.graph)
  const navigateToNode = useNavigateToNode()

  // この評価軸を使う論証 (back-link)
  const usingArguments = graph.edges
    .filter((e) => e.kind === "evaluates-by" && e.to === node.id)
    .map((e) => graph.arguments.find((a) => a.id === e.from))
    .filter((a): a is ArgumentNode => Boolean(a))

  return (
    <>
      <Field label="text">
        <input
          value={node.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          style={inputStyle}
        />
      </Field>
      <Field label="weight">
        <select
          value={node.weight ?? ""}
          onChange={(e) =>
            onUpdate({
              weight: (e.target.value || undefined) as Confidence | undefined,
            })
          }
          style={inputStyle}
        >
          <option value="">(未設定)</option>
          <option value="strong">strong</option>
          <option value="moderate">moderate</option>
          <option value="weak">weak</option>
        </select>
      </Field>

      {usingArguments.length > 0 && (
        <Field label={`この評価軸を使う論証 (${usingArguments.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {usingArguments.map((a) => {
              const text = a.data[0] ?? "(根拠未入力)"
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => navigateToNode(a.id)}
                  style={navListButtonStyle}
                  title={a.kind === "pro" ? "Pro 論証" : "Con 論証"}
                >
                  <span style={{ color: "var(--text-muted)", marginRight: 6 }}>
                    [{a.kind === "pro" ? "Pro" : "Con"}]
                  </span>
                  {truncateText(text, 60)}
                </button>
              )
            })}
          </div>
        </Field>
      )}
    </>
  )
}

function ReferencePanel({ node, onUpdate }: PanelProps<ReferenceNode>) {
  const graph = useGraphStore((s) => s.graph)
  const navigateToNode = useNavigateToNode()

  // この参照を引用する論証 (back-link)
  const citingArguments = graph.edges
    .filter((e) => e.kind === "cites" && e.to === node.id)
    .map((e) => graph.arguments.find((a) => a.id === e.from))
    .filter((a): a is ArgumentNode => Boolean(a))

  return (
    <>
      <Field label="title">
        <input
          value={node.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          style={inputStyle}
        />
      </Field>
      <Field label="uri">
        <input
          value={node.uri ?? ""}
          onChange={(e) => onUpdate({ uri: e.target.value || undefined })}
          placeholder="https://..."
          style={inputStyle}
        />
      </Field>
      <Field label="excerpt">
        <textarea
          value={node.excerpt ?? ""}
          onChange={(e) => onUpdate({ excerpt: e.target.value || undefined })}
          rows={3}
          style={inputStyle}
        />
      </Field>

      {citingArguments.length > 0 && (
        <Field label={`この参照を引用する論証 (${citingArguments.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {citingArguments.map((a) => {
              const text = a.data[0] ?? "(根拠未入力)"
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => navigateToNode(a.id)}
                  style={navListButtonStyle}
                  title={a.kind === "pro" ? "Pro 論証" : "Con 論証"}
                >
                  <span style={{ color: "var(--text-muted)", marginRight: 6 }}>
                    [{a.kind === "pro" ? "Pro" : "Con"}]
                  </span>
                  {truncateText(text, 60)}
                </button>
              )
            })}
          </div>
        </Field>
      )}
    </>
  )
}

/* ── Edge panel ──────────────────────────── */

function EdgePanel({
  edge,
  onClearAfterDelete,
}: {
  edge: Edge
  onClearAfterDelete: () => void
}) {
  const deleteEdge = useGraphStore((s) => s.deleteEdge)

  return (
    <>
      <div style={headerStyle}>edge</div>

      {/*
        kind はノード型ペアから自動推定されるため、サイドバーからの手動変更を
        禁止する（Argument の pro/con 切替時は store 側で supports/attacks を
        自動同期するので、編集はそちらで行う）。
      */}
      <Field label="kind">
        <code
          style={{
            fontSize: 12,
            color: "var(--text-primary)",
            padding: "4px 8px",
            background: "var(--surface-hover)",
            borderRadius: 3,
            display: "inline-block",
          }}
        >
          {edge.kind}
        </code>
      </Field>

      <Field label="from">
        <code style={{ fontSize: 10, color: "var(--text-muted)" }}>{edge.from}</code>
      </Field>
      <Field label="to">
        <code style={{ fontSize: 10, color: "var(--text-muted)" }}>{edge.to}</code>
      </Field>
      <Field label="ID">
        <code style={{ fontSize: 10, color: "var(--text-muted)" }}>{edge.id}</code>
      </Field>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-danger"
          onClick={async () => {
            const ok = await useUIStore.getState().showConfirm({
              title: "エッジの削除",
              message: "このエッジを削除しますか？",
              confirmLabel: "削除",
              danger: true,
            })
            if (ok) {
              deleteEdge(edge.id)
              onClearAfterDelete()
            }
          }}
        >
          削除
        </button>
      </div>
    </>
  )
}
