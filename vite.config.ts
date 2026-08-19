import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

// ビルド成果物は dist/index.html 1 枚のみ。JS/CSS は全て HTML にインライン化され、
// 外部アセット参照が発生しないため basePath / assetPrefix の調整は不要
// (file:// でもサブパス配信でもそのまま開ける)。詳細は docs/adr/0001-vite-singlefile-html.md。
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  // Playwright の webServer が同じ port を前提にするため固定する。
  // 空いていなければ黙って別 port に逃げず失敗させたいので strictPort。
  server: { port: 5173, strictPort: true },
})
