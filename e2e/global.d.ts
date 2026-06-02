import type { useGraphStore } from "../src/store/graphStore"
import type { useUIStore } from "../src/store/uiStore"

declare global {
  interface Window {
    __argos?: {
      useGraphStore: typeof useGraphStore
      useUIStore: typeof useUIStore
    }
  }
}
