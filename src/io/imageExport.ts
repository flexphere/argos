import { toPng } from "html-to-image"

/**
 * 現在の React Flow グラフを PNG 画像としてダウンロードする。
 *
 * - 全ノードの bounding box を DOM から計算し、現在のズーム/パンに関係なく
 *   グラフ全体をキャプチャ
 * - `pixelRatio: 2` で 2x 解像度 → ズームしても文字が潰れない
 * - 背景色は React Flow コンテナの computed background-color (テーマ追従)
 * - フォントロード完了 (`document.fonts.ready`) を待ってからキャプチャ
 *
 * 取得対象は `.react-flow` (コンテナ) 全体。理由:
 *   - 既定 edge の label は `<EdgeLabelRenderer>` Portal 経由で
 *     `.react-flow__edgelabel-renderer` (viewport の兄弟) にレンダリングされるため
 *     viewport 単体キャプチャでは取り逃す
 *   - `.react-flow` を取れば viewport + edgelabel-renderer の両方を含められる
 *
 * 全体表示するため、capture 直前に以下を一時的に上書きしている:
 *   - `.react-flow__viewport.style.transform` (現在のズーム/パン → 原点 + padding)
 *   - `.react-flow__edgelabel-renderer.style.transform` (上に同じ。座標系を合わせる)
 *   - `.react-flow.style.{width,height,overflow}` (bounds を覆える矩形に)
 * 終了時 (finally) で必ず元に戻す。
 *
 * MiniMap / Controls / Background / 各種 Panel は filter で clone から除外する。
 */
export async function downloadGraphAsPng(filename: string = defaultImageName()): Promise<void> {
  const reactFlowEl = document.querySelector<HTMLElement>(".react-flow")
  const viewport = document.querySelector<HTMLElement>(".react-flow__viewport")
  if (!reactFlowEl || !viewport) {
    throw new Error("React Flow がレンダリングされていません")
  }
  const edgeLabelRenderer = document.querySelector<HTMLElement>(".react-flow__edgelabel-renderer")

  const nodeEls = Array.from(viewport.querySelectorAll<HTMLElement>(".react-flow__node"))
  if (nodeEls.length === 0) {
    throw new Error("グラフにノードがありません")
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const el of nodeEls) {
    const m = el.style.transform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/)
    if (!m) continue
    const x = Number.parseFloat(m[1])
    const y = Number.parseFloat(m[2])
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + el.offsetWidth)
    maxY = Math.max(maxY, y + el.offsetHeight)
  }
  if (!Number.isFinite(minX)) {
    throw new Error("グラフの bounding box を計算できませんでした")
  }

  const padding = 40
  const width = Math.ceil(maxX - minX + padding * 2)
  const height = Math.ceil(maxY - minY + padding * 2)

  const backgroundColor = getComputedStyle(reactFlowEl).backgroundColor

  // 全ノードが (padding, padding) 起点に並ぶよう transform を上書き
  const overrideTransform = `translate(${-minX + padding}px, ${-minY + padding}px) scale(1)`

  // 一時上書き → finally で逆順 restore
  const restores: Array<() => void> = []
  const stash = (
    el: HTMLElement,
    key: "transform" | "width" | "height" | "overflow",
    value: string,
  ) => {
    const before = el.style.getPropertyValue(key)
    const priority = el.style.getPropertyPriority(key)
    restores.push(() => {
      if (before) el.style.setProperty(key, before, priority)
      else el.style.removeProperty(key)
    })
    el.style.setProperty(key, value)
  }

  stash(viewport, "transform", overrideTransform)
  if (edgeLabelRenderer) stash(edgeLabelRenderer, "transform", overrideTransform)
  // .react-flow を bounds 全体を含むサイズに広げる (html-to-image の clone は
  // 元 element の size を見るため、ここで実 size を変えないと右下が切れる)
  stash(reactFlowEl, "width", `${width}px`)
  stash(reactFlowEl, "height", `${height}px`)
  stash(reactFlowEl, "overflow", "visible")

  // SVG edge label の fill (`<rect class="react-flow__edge-textbg">` の背景 +
  // `<text class="react-flow__edge-text">` の文字色) は CSS class 経由で
  // 当たっており、html-to-image の computed-style コピーで取りこぼされて
  // 不透明な黒に化けることがある (= ラベルが見えなくなる)。capture 直前に
  // computed 値を inline に焼いて回避する。
  const inlineSvgFill = (selector: string) => {
    for (const el of document.querySelectorAll<SVGGraphicsElement>(selector)) {
      const fill = getComputedStyle(el).fill
      if (!fill || fill === "none") continue
      const before = el.style.fill
      restores.push(() => {
        el.style.fill = before
      })
      el.style.fill = fill
    }
  }
  inlineSvgFill(".react-flow__edge-textbg")
  inlineSvgFill(".react-flow__edge-text")

  if ("fonts" in document) {
    await document.fonts.ready
  }

  try {
    const dataUrl = await toPng(reactFlowEl, {
      backgroundColor,
      width,
      height,
      pixelRatio: 2,
      filter: (node) => {
        if (!(node instanceof Element)) return true
        const cls = node.classList
        return !(
          cls.contains("react-flow__minimap") ||
          cls.contains("react-flow__controls") ||
          cls.contains("react-flow__panel") ||
          cls.contains("react-flow__background") ||
          cls.contains("react-flow__attribution")
        )
      },
    })

    const a = document.createElement("a")
    a.download = filename
    a.href = dataUrl
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    for (const restore of restores.reverse()) restore()
  }
}

function defaultImageName(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `argos-${stamp}.png`
}
