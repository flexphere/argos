import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "argos",
  description: "議論可視化",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // テーマ適用は App.tsx の useEffect で mount 後に行う。
  // 初回 load 時に light → dark のフラッシュが一瞬発生するが、hydration mismatch を避けるためこの形を取る。
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
