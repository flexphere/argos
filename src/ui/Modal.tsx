import { useEffect } from "react"

interface ModalProps {
  open: boolean
  title?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  /**
   * Modal コンテナ ( `.modal` 要素 ) に追加するクラス。
   * デフォルトの max-width 480 を上書きしたい場合などに使う (例: `.extract-modal`)。
   */
  className?: string
}

export function Modal({ open, title, onClose, children, footer, className }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape は document keydown で対応済み
    <div className="modal-backdrop" onClick={onClose}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation 用の容器、操作は内部要素で受ける */}
      <div
        className={className ? `modal ${className}` : "modal"}
        onClick={(e) => e.stopPropagation()}
        // biome-ignore lint/a11y/useSemanticElements: <dialog> 移行は a11y 改善タスクで別途検討
        role="dialog"
        aria-modal="true"
      >
        {title && <div className="modal-header">{title}</div>}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
