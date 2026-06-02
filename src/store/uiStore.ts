import { create } from "zustand"

export type ThemePreference = "system" | "light" | "dark"
export type EffectiveTheme = "light" | "dark"

const THEME_STORAGE_KEY = "argos:theme"

/**
 * クライアント側でのみ呼ぶこと。SSR では window が undefined なので "system" 固定。
 * App.tsx の mount 後 useEffect 内で読み込み、setThemePreference に渡して state を同期する。
 */
export function loadStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system"
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === "light" || raw === "dark" || raw === "system") return raw
  } catch {
    // ignore (private browsing 等)
  }
  return "system"
}

function persistTheme(theme: ThemePreference): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // ignore
  }
}

/**
 * 「ユーザの選好 + OS 設定」から実効テーマを決定する。
 * SSR 時は light をデフォルトとして返す（後で再評価される）。
 */
export function resolveEffectiveTheme(pref: ThemePreference): EffectiveTheme {
  if (pref === "light" || pref === "dark") return pref
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

/* ── Confirm dialog ──────────────────────────── */
// 外部 import なし。showConfirm の引数として型推論で使われるので export 不要。
interface ConfirmOptions {
  message: string
  title?: string
  /** 削除等の破壊的操作は danger=true で OK ボタンを赤系にする */
  danger?: boolean
  confirmLabel?: string
  cancelLabel?: string
}

interface ConfirmState extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

type ContextMenuKind = "single-node" | "selection" | "pane"

interface ContextMenuState {
  x: number
  y: number
  kind: ContextMenuKind
  targetIds: string[]
  /** kind: "pane" のとき、新規ノード追加先の座標（flow 座標系） */
  flowPosition?: { x: number; y: number }
}

export interface UIStore {
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  contextMenu: ContextMenuState | null
  /** ユーザの明示的なテーマ選好。OS 設定に従う場合は "system"。 */
  themePreference: ThemePreference
  /** 確認ダイアログの状態。null の間は閉じている。 */
  confirmState: ConfirmState | null

  setSelectedNodeIds: (ids: string[]) => void
  setSelectedEdgeIds: (ids: string[]) => void
  selectNode: (id: string) => void
  selectEdge: (id: string) => void
  clearSelection: () => void

  openContextMenu: (menu: ContextMenuState) => void
  closeContextMenu: () => void

  setThemePreference: (theme: ThemePreference) => void

  /** Promise ベースの確認ダイアログ。await で結果を受け取れる。 */
  showConfirm: (opts: ConfirmOptions) => Promise<boolean>
  resolveConfirm: (ok: boolean) => void
}

function shallowEqualIds(a: string[], b: string[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export const useUIStore = create<UIStore>((set, get) => ({
  selectedNodeIds: [],
  selectedEdgeIds: [],
  contextMenu: null,
  // 初期値は "system" 固定（SSR/client 間で hydration mismatch を防ぐ）。
  // クライアント mount 後に App が loadStoredTheme() を呼んで反映する。
  themePreference: "system",
  confirmState: null,

  setSelectedNodeIds: (ids) => {
    // Avoid no-op state updates that could trigger render loops.
    if (shallowEqualIds(get().selectedNodeIds, ids)) return
    set({ selectedNodeIds: ids })
  },
  setSelectedEdgeIds: (ids) => {
    if (shallowEqualIds(get().selectedEdgeIds, ids)) return
    set({ selectedEdgeIds: ids })
  },
  selectNode: (id) => set({ selectedNodeIds: [id], selectedEdgeIds: [] }),
  selectEdge: (id) => set({ selectedEdgeIds: [id], selectedNodeIds: [] }),
  clearSelection: () => set({ selectedNodeIds: [], selectedEdgeIds: [] }),

  openContextMenu: (menu) => set({ contextMenu: menu }),
  closeContextMenu: () => set({ contextMenu: null }),

  setThemePreference: (theme) => {
    persistTheme(theme)
    set({ themePreference: theme })
  },

  showConfirm: (opts) =>
    new Promise<boolean>((resolve) => {
      // 既に別の confirm が開いていれば先に false で閉じる
      const prev = get().confirmState
      if (prev) prev.resolve(false)
      set({ confirmState: { ...opts, resolve } })
    }),
  resolveConfirm: (ok) => {
    const s = get().confirmState
    if (!s) return
    s.resolve(ok)
    set({ confirmState: null })
  },
}))
