import { useEffect, useState } from "react"

interface Props {
  value: string
  onCommit: (next: string) => void
  multiline?: boolean
  placeholder?: string
  style?: React.CSSProperties
}

export function EditableText({
  value,
  onCommit,
  multiline = true,
  placeholder = "(空)",
  style,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  if (!editing) {
    return (
      <div
        onDoubleClick={() => setEditing(true)}
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          cursor: "text",
          minHeight: "1em",
          ...style,
        }}
      >
        {value || <span style={{ color: "var(--text-muted)" }}>{placeholder}</span>}
      </div>
    )
  }

  const commit = () => {
    setEditing(false)
    if (draft !== value) onCommit(draft)
  }

  const cancel = () => {
    setDraft(value)
    setEditing(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      cancel()
    } else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      commit()
    }
  }

  const sharedProps = {
    autoFocus: true,
    className: "nodrag",
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) =>
      setDraft(e.target.value),
    onBlur: commit,
    onKeyDown,
    style: {
      width: "100%",
      boxSizing: "border-box" as const,
      fontSize: 13,
      fontFamily: "inherit",
      border: "1px solid var(--accent-info)",
      background: "var(--surface-input)",
      color: "var(--text-primary)",
      borderRadius: 3,
      padding: "2px 4px",
      ...style,
    },
  }

  return multiline ? <textarea {...sharedProps} rows={3} /> : <input {...sharedProps} />
}
