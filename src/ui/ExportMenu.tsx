import { useEffect, useRef, useState } from "react"
import { buildExportRoot, defaultFilename, downloadJson } from "../io/jsonIO"
import { graphToMarkdown } from "../io/markdown"
import { useGraphStore } from "../store/graphStore"

function downloadText(text: string, filename: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function timestampedName(ext: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `argos-${stamp}.${ext}`
}

export function ExportMenu() {
  const [open, setOpen] = useState(false)
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

  const handleMarkdown = () => {
    const graph = useGraphStore.getState().graph
    downloadText(graphToMarkdown(graph), timestampedName("md"), "text/markdown")
    setOpen(false)
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
          <button type="button" className="export-menu-item" onClick={handleMarkdown}>
            <span className="export-menu-icon">📄</span>
            <span>
              <div className="export-menu-name">Markdown (.md)</div>
              <div className="export-menu-desc">議事録レポート・Mermaid 埋込み</div>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
