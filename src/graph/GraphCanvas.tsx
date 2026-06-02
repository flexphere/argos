import {
  Background,
  Controls,
  type EdgeChange,
  MiniMap,
  type NodeChange,
  type Edge as RFEdge,
  type Node as RFNode,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { detectStructuralSignals, signalsForNode } from "../signals"
import { useGraphStore } from "../store/graphStore"
import { resolveEffectiveTheme, useUIStore } from "../store/uiStore"
import { graphToFlowEdges, graphToFlowNodes } from "./conversion"
import { nodeTypes } from "./customNodes"
import { lookupNodeRef, resolveConnection } from "./edgeKind"

export function GraphCanvas() {
  const graph = useGraphStore((s) => s.graph)
  const setNodePosition = useGraphStore((s) => s.setNodePosition)
  const deleteNode = useGraphStore((s) => s.deleteNode)
  const deleteEdge = useGraphStore((s) => s.deleteEdge)

  const selectedNodeIds = useUIStore((s) => s.selectedNodeIds)
  const selectedEdgeIds = useUIStore((s) => s.selectedEdgeIds)
  const setSelectedNodeIds = useUIStore((s) => s.setSelectedNodeIds)
  const setSelectedEdgeIds = useUIStore((s) => s.setSelectedEdgeIds)
  const clearSelection = useUIStore((s) => s.clearSelection)
  const addEdge = useGraphStore((s) => s.addEdge)
  const openContextMenu = useUIStore((s) => s.openContextMenu)
  const closeContextMenu = useUIStore((s) => s.closeContextMenu)
  const themePreference = useUIStore((s) => s.themePreference)
  // SSR と client 初回 render では window/matchMedia へのアクセス可否で
  // resolveEffectiveTheme の戻り値がズレ得るため、マウント後にだけ実際の
  // 解決結果を使う。マウント前は server と同じ "light" を返す。
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  const effectiveTheme = mounted ? resolveEffectiveTheme(themePreference) : "light"

  const rf = useReactFlow()

  const selectedNodeSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])
  const selectedEdgeSet = useMemo(() => new Set(selectedEdgeIds), [selectedEdgeIds])

  // controlled モード: store の選択状態 + 構造系シグナルを flowNodes に注入する
  const signals = useMemo(() => detectStructuralSignals(graph), [graph])

  // controlled モードでは React Flow が ResizeObserver で測定した寸法を
  // onNodesChange の "dimensions" 変更として通知してくるが、その寸法は
  // 自前で保持して userNode に書き戻さないと MiniMap が ノードを弾く
  // （nodeHasDimensions(userNode) が false になる）。
  const [measurements, setMeasurements] = useState<Map<string, { width: number; height: number }>>(
    () => new Map(),
  )

  const flowNodes = useMemo<RFNode[]>(() => {
    const nodes = graphToFlowNodes(graph)
    return nodes.map((n) => {
      const measured = measurements.get(n.id)
      return {
        ...n,
        selected: selectedNodeSet.has(n.id),
        data: {
          ...(n.data ?? {}),
          _signals: signalsForNode(signals, n.id),
        },
        ...(measured ? { measured } : {}),
      }
    })
  }, [graph, selectedNodeSet, signals, measurements])

  const flowEdges = useMemo<RFEdge[]>(
    () => graphToFlowEdges(graph, selectedEdgeSet),
    [graph, selectedEdgeSet],
  )

  // MiniMap の縦横比をグラフの bounding-box に合わせる。
  // layout B (行ラップ廃止) でグラフが横長になりやすくなったため、
  // 既定の 200×150 だと縦方向に空きが多くノードが潰れて見にくい。
  // 面積感は元と同程度に保ちつつ width/height だけ可変にする。
  const minimapStyle = useMemo<{ width: number; height: number }>(() => {
    const APPROX_NODE_W = 220
    const APPROX_NODE_H = 90
    const DEFAULT = { width: 200, height: 150 }
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const n of flowNodes) {
      if (!n.position) continue
      minX = Math.min(minX, n.position.x)
      maxX = Math.max(maxX, n.position.x + APPROX_NODE_W)
      minY = Math.min(minY, n.position.y)
      maxY = Math.max(maxY, n.position.y + APPROX_NODE_H)
    }
    if (!Number.isFinite(minX)) return DEFAULT
    const graphW = Math.max(1, maxX - minX)
    const graphH = Math.max(1, maxY - minY)
    const aspect = graphW / graphH
    // 元の MiniMap が約 30000 px² (200×150) なのでそれを保つ
    const AREA = 30000
    const width = Math.round(Math.min(560, Math.max(200, Math.sqrt(AREA * aspect))))
    const height = Math.round(Math.min(280, Math.max(100, Math.sqrt(AREA / aspect))))
    return { width, height }
  }, [flowNodes])

  // ドラッグ進行中フラグ。最初の dragging=true で「ドラッグ前の graph」を pastStates に積み、
  // 以後 dragging=true の間は temporal を pause（無数の中間位置を履歴に積まない）。
  // dragging=false（ドラッグ終了）で最終位置を適用したあと resume する。
  // 結果としてドラッグ1回 = 履歴エントリ1件（取り消すとドラッグ前の位置に戻る）。
  const isDraggingRef = useRef(false)

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      let nextSelected: Set<string> | null = null
      let dimensionUpdates: Map<string, { width: number; height: number }> | null = null
      let removedIds: string[] | null = null
      for (const change of changes) {
        if (change.type === "dimensions" && change.dimensions) {
          if (!dimensionUpdates) dimensionUpdates = new Map()
          dimensionUpdates.set(change.id, change.dimensions)
          continue
        }
        if (change.type === "position" && change.position) {
          const temporal = useGraphStore.temporal
          if (change.dragging && !isDraggingRef.current) {
            // ドラッグ開始：先にドラッグ前 graph を past に積む
            isDraggingRef.current = true
            const snapshot = { graph: useGraphStore.getState().graph }
            const currentPast = temporal.getState().pastStates
            temporal.setState({
              pastStates: [...currentPast, snapshot].slice(-50),
              futureStates: [],
            })
            temporal.getState().pause()
          }
          setNodePosition(change.id, change.position)
          if (!change.dragging && isDraggingRef.current) {
            // ドラッグ終了：最終位置適用後に resume
            isDraggingRef.current = false
            temporal.getState().resume()
          }
        } else if (change.type === "remove") {
          if (!removedIds) removedIds = []
          removedIds.push(change.id)
          deleteNode(change.id)
        } else if (change.type === "select") {
          if (!nextSelected) {
            nextSelected = new Set(useUIStore.getState().selectedNodeIds)
          }
          if (change.selected) nextSelected.add(change.id)
          else nextSelected.delete(change.id)
        }
      }
      if (nextSelected) {
        setSelectedNodeIds([...nextSelected])
      }
      if (dimensionUpdates || removedIds) {
        setMeasurements((prev) => {
          const next = new Map(prev)
          if (dimensionUpdates) {
            for (const [id, dim] of dimensionUpdates) next.set(id, dim)
          }
          if (removedIds) {
            for (const id of removedIds) next.delete(id)
          }
          return next
        })
      }
    },
    [setNodePosition, deleteNode, setSelectedNodeIds],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      let nextSelected: Set<string> | null = null
      for (const change of changes) {
        if (change.type === "remove") {
          deleteEdge(change.id)
        } else if (change.type === "select") {
          if (!nextSelected) {
            nextSelected = new Set(useUIStore.getState().selectedEdgeIds)
          }
          if (change.selected) nextSelected.add(change.id)
          else nextSelected.delete(change.id)
        }
      }
      if (nextSelected) {
        setSelectedEdgeIds([...nextSelected])
      }
    },
    [deleteEdge, setSelectedEdgeIds],
  )

  // 接続成立時：エッジ種別を自動推定して即作成。
  // 不正ペア（resolveConnection が null を返す）は無視する。
  const onConnect = useCallback(
    (params: { source: string | null; target: string | null }) => {
      if (!params.source || !params.target) return
      const a = lookupNodeRef(graph, params.source)
      const b = lookupNodeRef(graph, params.target)
      if (!a || !b) return
      const resolved = resolveConnection(a, b)
      if (!resolved) return
      addEdge(resolved.kind, resolved.from, resolved.to)
    },
    [graph, addEdge],
  )

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: RFNode) => {
      event.preventDefault()
      // useReactFlow で React Flow 内部の実選択を取得（store のラグから独立）
      const currentlySelected = rf
        .getNodes()
        .filter((n) => n.selected)
        .map((n) => n.id)
      if (currentlySelected.length > 1 && currentlySelected.includes(node.id)) {
        openContextMenu({
          x: event.clientX,
          y: event.clientY,
          kind: "selection",
          targetIds: currentlySelected,
        })
        return
      }
      const kind = "single-node"
      openContextMenu({
        x: event.clientX,
        y: event.clientY,
        kind,
        targetIds: [node.id],
      })
    },
    [openContextMenu, rf],
  )

  const onSelectionContextMenu = useCallback(
    (event: React.MouseEvent, nodes: RFNode[]) => {
      event.preventDefault()
      openContextMenu({
        x: event.clientX,
        y: event.clientY,
        kind: "selection",
        targetIds: nodes.map((n) => n.id),
      })
    },
    [openContextMenu],
  )

  const onPaneClick = useCallback(() => {
    clearSelection()
    closeContextMenu()
  }, [clearSelection, closeContextMenu])

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault()
      const flowPos = rf.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      openContextMenu({
        x: event.clientX,
        y: event.clientY,
        kind: "pane",
        targetIds: [],
        flowPosition: flowPos,
      })
    },
    [openContextMenu, rf],
  )

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onPaneClick={onPaneClick}
      onPaneContextMenu={onPaneContextMenu}
      onNodeContextMenu={onNodeContextMenu}
      onSelectionContextMenu={onSelectionContextMenu}
      multiSelectionKeyCode={["Meta", "Control"]}
      selectionKeyCode="Shift"
      colorMode={effectiveTheme}
      fitView
    >
      <Background />
      <Controls />
      <MiniMap style={minimapStyle} />
    </ReactFlow>
  )
}
