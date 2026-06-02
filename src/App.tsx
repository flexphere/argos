import { useEffect } from "react"
import { GraphCanvas } from "./graph/GraphCanvas"
import { computeLayout } from "./graph/layout"
import { useGraphStore } from "./store/graphStore"
import {
  type ThemePreference,
  loadStoredTheme,
  resolveEffectiveTheme,
  useUIStore,
} from "./store/uiStore"
import { ConfirmDialog } from "./ui/ConfirmDialog"
import { ContextMenu } from "./ui/ContextMenu"
import { ExportMenu } from "./ui/ExportMenu"
import { ImportMenu } from "./ui/ImportMenu"
import { SidePanel } from "./ui/SidePanel"

export function App() {
  const reset = useGraphStore((s) => s.reset)
  const themePreference = useUIStore((s) => s.themePreference)
  const setThemePreference = useUIStore((s) => s.setThemePreference)

  // mount 時に localStorage の保存値を読み出して store に反映する。
  // hydration mismatch を避けるため、初期 render では常に "system" として扱い、
  // クライアント側で mount 後にだけ実際の保存値を適用する。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 初回マウントのみ実行する意図
  useEffect(() => {
    const stored = loadStoredTheme()
    if (stored !== themePreference) setThemePreference(stored)
  }, [])

  // テーマ適用 effect:
  //   - themePreference + OS 設定から実効テーマを解決して <html data-theme> を更新
  //   - "system" 選好時は OS の prefers-color-scheme 変化を購読してリアルタイム追従
  useEffect(() => {
    if (typeof window === "undefined") return
    const apply = () => {
      const effective = resolveEffectiveTheme(themePreference)
      document.documentElement.setAttribute("data-theme", effective)
    }
    apply()
    if (themePreference !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [themePreference])

  const cycleTheme = () => {
    const next: ThemePreference =
      themePreference === "system" ? "light" : themePreference === "light" ? "dark" : "system"
    setThemePreference(next)
  }

  const themeToggleLabel =
    themePreference === "system"
      ? "OS 設定に従う（クリックで Light に切替）"
      : themePreference === "light"
        ? "Light（クリックで Dark に切替）"
        : "Dark（クリックで OS 設定に戻す）"

  const themeToggleIcon =
    themePreference === "system" ? "🖥️" : themePreference === "light" ? "☀️" : "🌙"

  // CMD/Ctrl + Z で Undo、CMD/Ctrl + Shift + Z または CTRL+Y で Redo。
  // テキスト入力中（input/textarea/contenteditable がフォーカス）はブラウザ標準に委譲。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return
      }
      const cmd = e.metaKey || e.ctrlKey
      if (!cmd) return
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        useGraphStore.temporal.getState().undo()
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault()
        useGraphStore.temporal.getState().redo()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const handleAutoLayout = () => {
    const graph = useGraphStore.getState().graph
    const positions = computeLayout(graph)
    useGraphStore.getState().setNodePositions(positions)
  }

  const showConfirm = useUIStore((s) => s.showConfirm)

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      <header className="app-header">
        <h1 className="app-title">
          argos
          <span className="app-title-sub">議論可視化</span>
        </h1>

        <div className="toolbar-spacer" />

        <button type="button" className="btn" onClick={handleAutoLayout}>
          <span className="btn-icon">🔧</span> 自動レイアウト
        </button>
        <ExportMenu />
        <ImportMenu />

        <div className="toolbar-sep" />

        <button
          type="button"
          className="btn btn-danger"
          onClick={async () => {
            const ok = await showConfirm({
              title: "グラフのリセット",
              message: "現在のグラフが全て削除されます。この操作は取り消せません。続行しますか？",
              confirmLabel: "リセット",
              danger: true,
            })
            if (ok) reset()
          }}
        >
          リセット
        </button>

        <button
          type="button"
          className="theme-toggle"
          onClick={cycleTheme}
          aria-label={themeToggleLabel}
          title={themeToggleLabel}
          suppressHydrationWarning
        >
          <span suppressHydrationWarning>{themeToggleIcon}</span>
        </button>
      </header>

      <main style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <GraphCanvas />
        </div>
        <SidePanel />
      </main>

      <ContextMenu />
      <ConfirmDialog />
    </div>
  )
}
