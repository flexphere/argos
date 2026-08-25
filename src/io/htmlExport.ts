import { EMBEDDED_DATA_ELEMENT_ID, escapeForScriptTag } from "../schema/embedded"
import { useGraphStore } from "../store/graphStore"
import { buildExportRoot } from "./jsonIO"

/**
 * 現在のグラフを焼き込んだ単一 HTML をダウンロードする。
 *
 * 受け取った配布 HTML を編集して、また HTML のまま渡せるようにするための出口。
 * skill が生成する HTML (scripts/embed-fixture.ts) と同じ規約でデータを埋め込むので、
 * 出力したファイルはそのままブラウザで開けば復元される。
 *
 * 土台には現在開いているページ自身を使う。argos のビルドは単一 HTML で
 * 外部アセット参照を持たないため (docs/adr/0001-vite-singlefile-html.md)、
 * ページを複製すればアプリごと持ち出せる。
 *
 * 埋め込むのは Export 形式 (buildExportRoot)。ノード位置や UUID を含む完全な
 * グラフなので、編集した状態がそのまま復元される。skill が出す fixture 形式は
 * ref ベースで再構築するため位置が失われる。
 */
export function downloadGraphAsHtml(filename: string = defaultHtmlName()): void {
  // dev サーバーでは script が /src/main.tsx を外部参照したままなので、
  // 出力した HTML は単体では動かない。本番ビルド (単一 HTML) 専用の機能。
  if (import.meta.env.DEV) {
    console.warn(
      "dev サーバーでは外部アセット参照が残るため、出力した HTML は単体では動きません。pnpm build した成果物で実行してください。",
    )
  }
  const html = buildEmbeddedHtml()
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 現在のページを複製し、埋め込みデータを差し替えた HTML 文字列を作る。
 *
 * - `#root` の中身は空にする。React が描画した後の DOM を持ち出しても、
 *   次に開いたとき mount で上書きされるだけで無駄が大きいため
 * - 既に埋め込みがあれば差し替える (配布 HTML を編集して再出力する経路)
 * - script の中身は escapeForScriptTag を通す。`textContent` に生の JSON を
 *   入れると、HTML シリアライズ時に `</script>` がそのまま出力されて壊れる
 */
function buildEmbeddedHtml(): string {
  const clone = document.documentElement.cloneNode(true) as HTMLElement

  const mountPoint = clone.querySelector("#root")
  if (mountPoint) mountPoint.innerHTML = ""

  clone.querySelector(`#${EMBEDDED_DATA_ELEMENT_ID}`)?.remove()

  const root = buildExportRoot(useGraphStore.getState().graph)
  const script = clone.ownerDocument.createElement("script")
  script.type = "application/json"
  script.id = EMBEDDED_DATA_ELEMENT_ID
  script.textContent = escapeForScriptTag(JSON.stringify(root))

  const head = clone.querySelector("head")
  if (!head) throw new Error("head 要素が見つかりません")
  head.appendChild(script)

  return `<!doctype html>\n${clone.outerHTML}`
}

export function defaultHtmlName(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `argos-${stamp}.html`
}
