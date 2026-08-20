import { copyFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import react from "@vitejs/plugin-react"
import { type Plugin, defineConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

// plugin 配布用に、ビルド済み HTML を skill ディレクトリ配下にも複製する。
// これを git track することで、plugin 利用者はリポジトリを clone して
// ビルドしなくても argos を開けるようになる (docs/adr/0002-bundle-html-in-plugin.md)。
// cp コマンドではなく node の API を使うのは OS 差を持ち込まないため。
const PLUGIN_ASSET = ".claude/skills/argos/assets/argos.html"

function copyToPluginAssets(): Plugin {
  return {
    name: "argos:copy-to-plugin-assets",
    apply: "build",
    closeBundle() {
      mkdirSync(path.dirname(PLUGIN_ASSET), { recursive: true })
      copyFileSync("dist/index.html", PLUGIN_ASSET)
    },
  }
}

// ビルド成果物は dist/index.html 1 枚のみ。JS/CSS は全て HTML にインライン化され、
// 外部アセット参照が発生しないため basePath / assetPrefix の調整は不要
// (file:// でもサブパス配信でもそのまま開ける)。詳細は docs/adr/0001-vite-singlefile-html.md。
export default defineConfig({
  plugins: [react(), viteSingleFile(), copyToPluginAssets()],
  // Playwright の webServer が同じ port を前提にするため固定する。
  // 空いていなければ黙って別 port に逃げず失敗させたいので strictPort。
  server: { port: 5173, strictPort: true },
})
