import { ReactFlowProvider } from "@xyflow/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./globals.css"
import { App } from "./App"
import { applyExtraction } from "./io/applyExtraction"
import { readEmbeddedFixture } from "./io/embeddedFixture"
import { useGraphStore } from "./store/graphStore"
import { useUIStore } from "./store/uiStore"

if (import.meta.env.DEV) {
  window.__argos = { useUIStore, useGraphStore }
}

/**
 * skill が焼き込んだ議論データがあれば取り込む (docs/adr/0003-embed-data-in-html.md)。
 *
 * 取り込みに失敗してもアプリは起動させる。壊れたデータで白画面になるより、
 * 空グラフで開いて Import を促せる状態のほうがよい。
 */
function applyEmbeddedFixture(): void {
  let embedded: ReturnType<typeof readEmbeddedFixture>
  try {
    embedded = readEmbeddedFixture()
  } catch (e) {
    console.error("埋め込みデータの読み込みに失敗しました。空のグラフで起動します:", e)
    return
  }
  if (!embedded) return

  const store = useGraphStore.getState()
  if (embedded.kind === "export") {
    store.importGraph(embedded.data.graph)
    return
  }
  const refToId = applyExtraction(embedded.data)
  if (embedded.data.semantic) {
    useGraphStore.getState().applyStoredSemantic(embedded.data.semantic, refToId)
  }
}

applyEmbeddedFixture()

const container = document.getElementById("root")
if (!container) throw new Error("#root element not found")

createRoot(container).render(
  <StrictMode>
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  </StrictMode>,
)
