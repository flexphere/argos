import type { SignalKind } from "../schema"

export interface SignalMeta {
  icon: string
  label: string
  severity: "warn" | "info"
}

export const SIGNAL_META: Record<SignalKind, SignalMeta> = {
  unanswered_attack: {
    icon: "⚠️",
    label: "未応答の反論",
    severity: "warn",
  },
  unsupported_claim: {
    icon: "❗",
    label: "未根拠の主張",
    severity: "warn",
  },
  criterion_mismatch: {
    icon: "⚖️",
    label: "評価基準の不一致",
    severity: "warn",
  },
  semantic_drift: {
    icon: "🔀",
    label: "論点ズレ",
    severity: "info",
  },
  term_inconsistency: {
    icon: "📝",
    label: "用語の不整合",
    severity: "info",
  },
  // ── 抽出品質シグナル ────────────────
  orphan_argument: {
    icon: "🪶",
    label: "未接続の論証",
    severity: "warn",
  },
  unreachable_issue: {
    icon: "🕳️",
    label: "主張なき議題",
    severity: "warn",
  },
  disconnected_criterion: {
    icon: "🧭",
    label: "未使用の評価基準",
    severity: "info",
  },
  disconnected_reference: {
    icon: "🔖",
    label: "未引用の参照",
    severity: "info",
  },
  // ── alternative-to 制約 ─────────────
  agreed_alternatives_conflict: {
    icon: "⚔️",
    label: "代替案が同時 agreed",
    severity: "warn",
  },
  // ── 接続先ミスマッチ ─────────────
  misplaced_argument: {
    icon: "🎯",
    label: "論証の接続先要見直し",
    severity: "warn",
  },
  // ── 意思決定支援 (課題 6) ─────────────
  ready_to_agree: {
    icon: "✅",
    label: "採用検討の余地あり",
    severity: "info",
  },
}
