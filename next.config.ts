import type { NextConfig } from "next"

// 非ルートのパス配下にデプロイする場合は NEXT_PUBLIC_BASE_PATH を指定する。
// 例: `NEXT_PUBLIC_BASE_PATH=/foo/bar/argos pnpm build`
//   → index.html のスクリプトタグ・_next/ チャンク参照が全てそのパス配下になる。
//   → アプリ内の独自 fetch (例: `/extractions/<id>.json`) はクライアント側で
//     同じ env を読んで自前 prefix する (src/App.tsx 参照)。
// 設定なし (dev / ルート配信) のときは undefined にして従来挙動。
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // ブラウザ側は完全に静的サイト。API route は無く、Notion 取得・LLM 抽出・意味分析は
  // すべて Claude Code の skill 側で行う (詳細は .claude/skills/argos/SKILL.md)。
  output: "export",
  // export 時に Next の Image 最適化は使えない (unoptimized: true で透過)
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath,
}

export default nextConfig
