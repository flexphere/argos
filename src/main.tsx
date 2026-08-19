import { ReactFlowProvider } from "@xyflow/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./globals.css"
import { App } from "./App"
import { useGraphStore } from "./store/graphStore"
import { useUIStore } from "./store/uiStore"

if (import.meta.env.DEV) {
  window.__argos = { useUIStore, useGraphStore }
}

const container = document.getElementById("root")
if (!container) throw new Error("#root element not found")

createRoot(container).render(
  <StrictMode>
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  </StrictMode>,
)
