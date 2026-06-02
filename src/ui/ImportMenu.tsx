import { useEffect, useRef, useState } from "react"
import { applyExtraction } from "../io/applyExtraction"
import { parseImportFile } from "../io/jsonIO"
import { useGraphStore } from "../store/graphStore"
import { useUIStore } from "../store/uiStore"

/**
 * Import dropdown: JSON ファイル取り込み。
 * Export 形式 (graph 全体スナップショット) と skill 生成の fixture 形式
 * (`StoredFixture` = ExtractionResult + 任意の semantic) のどちらでも受け付ける。
 * パーサで形式判定 → 後者なら applyExtraction + applyStoredSemantic を流す。
 */
export function ImportMenu() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const importGraph = useGraphStore((s) => s.importGraph)
  const reset = useGraphStore((s) => s.reset)
  const applyStoredSemantic = useGraphStore((s) => s.applyStoredSemantic)
  const showConfirm = useUIStore((s) => s.showConfirm)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClickOutside)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const handleSelectFile = () => {
    setOpen(false)
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    try {
      const result = await parseImportFile(file)
      const ok = await showConfirm({
        title: "インポートの確認",
        message: "インポートすると現在のグラフは置き換えられます。続行しますか？",
        confirmLabel: "インポート",
      })
      if (!ok) return
      if (result.kind === "export") {
        importGraph(result.data.graph)
      } else {
        // skill 生成 fixture: graph を空にしてから extraction → semantic を順に適用
        reset()
        const refToId = applyExtraction(result.data)
        if (result.data.semantic) applyStoredSemantic(result.data.semantic, refToId)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      window.alert(`インポート失敗:\n${msg}`)
    }
  }

  return (
    <div ref={rootRef} className="export-menu-root">
      <button
        type="button"
        className="btn btn-file"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="btn-icon">📥</span> Import <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="export-menu" role="menu">
          <button type="button" className="export-menu-item" onClick={handleSelectFile}>
            <span className="export-menu-icon">📦</span>
            <span>
              <div className="export-menu-name">JSON ファイルから</div>
              <div className="export-menu-desc">エクスポート済みのグラフを読み込み</div>
            </span>
          </button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
    </div>
  )
}
