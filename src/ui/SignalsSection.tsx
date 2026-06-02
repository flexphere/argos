import { useState } from "react"
import type { Signal, SignalKind } from "../schema"
import { SIGNAL_META } from "../signals"

interface Props {
  signals: Signal[]
  /**
   * summary: シグナル種別ごとに集計（無選択時、複数選択時）
   * node: そのノードに紐づくシグナルだけ列挙
   */
  mode: "summary" | "node"
  title?: string
  /**
   * 影響ノードの表示ラベルを返す。null を返した場合はその ID は非表示（不正な ID 等）。
   * onNavigate も指定すると summary モードがアコーディオン化される。
   */
  getNodeLabel?: (id: string) => string | null
  /** 影響ノードクリック時のハンドラ。指定時にノードをクリック可能にする。 */
  onNavigate?: (nodeId: string) => void
  /**
   * アコーディオン展開状態（controlled）。指定時は外側で管理。
   * 指定なしならローカル state でフォールバック。
   */
  expandedKinds?: Set<SignalKind>
  onToggleExpanded?: (kind: SignalKind) => void
}

export function SignalsSection({
  signals,
  mode,
  title,
  getNodeLabel,
  onNavigate,
  expandedKinds,
  onToggleExpanded,
}: Props) {
  const [localExpanded, setLocalExpanded] = useState<Set<SignalKind>>(() => new Set())
  const expanded = expandedKinds ?? localExpanded

  const toggle = (kind: SignalKind) => {
    if (onToggleExpanded) {
      onToggleExpanded(kind)
      return
    }
    setLocalExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  if (signals.length === 0 && mode === "node") return null

  const groupedByKind = new Map<SignalKind, Signal[]>()
  for (const s of signals) {
    const arr = groupedByKind.get(s.kind) ?? []
    arr.push(s)
    groupedByKind.set(s.kind, arr)
  }

  const defaultTitle = mode === "node" ? "このノードのシグナル" : "考慮漏れシグナル"
  const canExpand = mode === "summary" && !!onNavigate && !!getNodeLabel

  return (
    <section className="signals-section">
      <div className="signals-header">{title ?? defaultTitle}</div>
      {signals.length === 0 ? (
        <div className="signals-empty">検出なし</div>
      ) : mode === "summary" ? (
        <ul className="signals-list">
          {Array.from(groupedByKind.entries()).map(([kind, sigs]) => {
            const meta = SIGNAL_META[kind]
            const isExpanded = expanded.has(kind)
            const affectedItems = canExpand
              ? Array.from(new Set(sigs.flatMap((s) => s.affected_node_ids)))
                  .map((id) => ({ id, label: getNodeLabel?.(id) ?? null }))
                  .filter((x): x is { id: string; label: string } => !!x.label)
              : []
            return (
              <li key={kind} className={`signal-item signal-${meta.severity}`}>
                <button
                  type="button"
                  className="signal-row-button"
                  onClick={() => {
                    if (canExpand) toggle(kind)
                  }}
                  aria-expanded={canExpand ? isExpanded : undefined}
                >
                  {canExpand && (
                    <span className={`signal-caret ${isExpanded ? "open" : ""}`} aria-hidden>
                      ▶
                    </span>
                  )}
                  <span className="signal-icon">{meta.icon}</span>
                  <span className="signal-label">{meta.label}</span>
                  <span className="signal-count">{sigs.length}</span>
                </button>
                {canExpand && isExpanded && affectedItems.length > 0 && (
                  <ul className="signal-children">
                    {affectedItems.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="signal-child-button"
                          onClick={() => onNavigate?.(item.id)}
                          title="クリックでノードを表示"
                        >
                          {item.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <ul className="signals-list">
          {signals.map((s, i) => {
            const meta = SIGNAL_META[s.kind]
            return (
              <li key={`${s.kind}-${i}`} className={`signal-item signal-${meta.severity}`}>
                <div className="signal-leaf">
                  <span className="signal-icon">{meta.icon}</span>
                  <span className="signal-label">{meta.label}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
