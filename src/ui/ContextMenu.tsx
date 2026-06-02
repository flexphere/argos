import { useEffect } from "react"
import { useGraphStore } from "../store/graphStore"
import { useUIStore } from "../store/uiStore"

export function ContextMenu() {
  const menu = useUIStore((s) => s.contextMenu)
  const close = useUIStore((s) => s.closeContextMenu)
  const showConfirm = useUIStore((s) => s.showConfirm)

  const deleteNode = useGraphStore((s) => s.deleteNode)
  const addIssue = useGraphStore((s) => s.addIssue)
  const addClaim = useGraphStore((s) => s.addClaim)
  const addArgument = useGraphStore((s) => s.addArgument)
  const addCriterion = useGraphStore((s) => s.addCriterion)
  const addReference = useGraphStore((s) => s.addReference)

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    const onClickOutside = () => close()
    document.addEventListener("keydown", onKey)
    document.addEventListener("click", onClickOutside)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("click", onClickOutside)
    }
  }, [menu, close])

  if (!menu) return null

  const handleDelete = async () => {
    if (menu.kind === "single-node") {
      const id = menu.targetIds[0]
      if (!id) {
        close()
        return
      }
      close()
      const ok = await showConfirm({
        title: "ノードの削除",
        message: "このノードを削除しますか？",
        confirmLabel: "削除",
        danger: true,
      })
      if (ok) deleteNode(id)
      return
    }
    if (menu.kind === "selection") {
      const ids = [...menu.targetIds]
      close()
      const ok = await showConfirm({
        title: "ノードの一括削除",
        message: `${ids.length} 件のノードを削除しますか？`,
        confirmLabel: "削除",
        danger: true,
      })
      if (ok) for (const id of ids) deleteNode(id)
      return
    }
    close()
  }

  // ── pane: 追加メニュー ──
  if (menu.kind === "pane") {
    const pos = menu.flowPosition
    const add = (fn: () => void) => () => {
      fn()
      close()
    }
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: 操作は内部のボタンに委譲、ESC は document keydown 経由
      <div
        className="context-menu"
        style={{ left: menu.x, top: menu.y }}
        onClick={(e) => e.stopPropagation()}
        role="menu"
      >
        <button
          type="button"
          className="context-menu-item"
          onClick={add(() => addIssue({ position: pos }))}
        >
          <span className="context-menu-icon">＋</span> 議題
        </button>
        <button
          type="button"
          className="context-menu-item"
          onClick={add(() => addClaim({ position: pos }))}
        >
          <span className="context-menu-icon">＋</span> 主張
        </button>
        <button
          type="button"
          className="context-menu-item"
          onClick={add(() => addArgument({ position: pos }))}
        >
          <span className="context-menu-icon">＋</span> 論証
        </button>
        <button
          type="button"
          className="context-menu-item"
          onClick={add(() => addCriterion({ position: pos }))}
        >
          <span className="context-menu-icon">＋</span> 評価基準
        </button>
        <button
          type="button"
          className="context-menu-item"
          onClick={add(() => addReference({ title: "新しい参照", position: pos }))}
        >
          <span className="context-menu-icon">＋</span> 参照
        </button>
      </div>
    )
  }

  // ── node / selection: 削除メニュー ──
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 操作は内部のボタンに委譲、ESC は document keydown 経由
    <div
      className="context-menu"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
      role="menu"
    >
      <button
        type="button"
        className="context-menu-item context-menu-item-danger"
        onClick={handleDelete}
      >
        <span className="context-menu-icon">×</span>
        {menu.kind === "selection" ? `削除（${menu.targetIds.length} 件）` : "削除"}
      </button>
    </div>
  )
}
