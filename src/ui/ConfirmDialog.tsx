import { useEffect, useRef } from "react"
import { useUIStore } from "../store/uiStore"
import { Modal } from "./Modal"

/**
 * Promise ベースの確認ダイアログ。
 * `useUIStore.getState().showConfirm({ message, ... })` で開き、await すると
 * ユーザの選択結果（true: 確定、false: キャンセル）が返る。
 * App.tsx で 1 つマウントしておけば、どこからでも呼び出せる。
 */
export function ConfirmDialog() {
  const confirmState = useUIStore((s) => s.confirmState)
  const resolve = useUIStore((s) => s.resolveConfirm)

  // 確認ボタンに初期 focus を当てる
  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (confirmState) {
      // Modal の表示完了後にフォーカス
      const t = window.setTimeout(() => confirmRef.current?.focus(), 50)
      return () => window.clearTimeout(t)
    }
  }, [confirmState])

  if (!confirmState) return null

  const {
    message,
    title = "確認",
    danger = false,
    confirmLabel = "OK",
    cancelLabel = "キャンセル",
  } = confirmState

  return (
    <Modal
      open
      title={title}
      onClose={() => resolve(false)}
      footer={
        <>
          <button type="button" className="btn" onClick={() => resolve(false)}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={() => resolve(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") resolve(true)
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: "var(--text-primary)",
          // showConfirm に渡された message 内の "\n" を改行として描画する
          // (代替案リスト等を行ごとに見せるため。CSS 標準のテキスト折返しも維持)
          whiteSpace: "pre-wrap",
        }}
      >
        {message}
      </div>
    </Modal>
  )
}
