import { useEffect, useRef, useState } from "react"
import { downloadGraphAsPng } from "../io/imageExport"
import { buildExportRoot, defaultFilename, downloadJson } from "../io/jsonIO"
import { useGraphStore } from "../store/graphStore"

export function ExportMenu() {
  const [open, setOpen] = useState(false)
  const [exportingPng, setExportingPng] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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

  const handleJson = () => {
    const graph = useGraphStore.getState().graph
    downloadJson(buildExportRoot(graph), defaultFilename())
    setOpen(false)
  }

  const handlePng = async () => {
    setExportingPng(true)
    try {
      await downloadGraphAsPng()
      setOpen(false)
    } catch (e) {
      console.error("PNG 出力に失敗しました:", e)
    } finally {
      setExportingPng(false)
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
        <span className="btn-icon">📤</span> Export <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="export-menu" role="menu">
          <button type="button" className="export-menu-item" onClick={handleJson}>
            <span className="export-menu-icon">📦</span>
            <span>
              <div className="export-menu-name">JSON</div>
              <div className="export-menu-desc">完全データ・再インポート可</div>
            </span>
          </button>
          <button
            type="button"
            className="export-menu-item"
            onClick={handlePng}
            disabled={exportingPng}
          >
            <span className="export-menu-icon">🖼️</span>
            <span>
              <div className="export-menu-name">PNG{exportingPng ? " (生成中...)" : ""}</div>
              <div className="export-menu-desc">高解像度 (2x) / ズームしても文字が潰れない</div>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
