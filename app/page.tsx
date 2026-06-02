"use client"

import { ReactFlowProvider } from "@xyflow/react"
import { App } from "../src/App"
import { useGraphStore } from "../src/store/graphStore"
import { useUIStore } from "../src/store/uiStore"

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  // biome-ignore lint/suspicious/noExplicitAny: dev-only debug exposure
  ;(window as any).__argos = { useUIStore, useGraphStore }
}

export default function Page() {
  return (
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  )
}
