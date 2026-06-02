import { temporal } from "zundo"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import type {
  ArgumentNode,
  ClaimNode,
  CriterionNode,
  Edge,
  EdgeKind,
  Graph,
  IssueNode,
  Position,
  ReferenceNode,
  Signal,
} from "../schema"
import type { SemanticAnalysisResult } from "../schema/semantic"

const emptyGraph: Graph = {
  issues: [],
  claims: [],
  arguments: [],
  criteria: [],
  references: [],
  edges: [],
  analysis_state: {
    structural_version: 0,
    is_semantic_stale: false,
  },
}

function incrementStructural(graph: Graph): Graph {
  return {
    ...graph,
    analysis_state: {
      ...graph.analysis_state,
      structural_version: graph.analysis_state.structural_version + 1,
      is_semantic_stale: true,
    },
  }
}

function newId(): string {
  return crypto.randomUUID()
}

export type NodeType = "issue" | "claim" | "argument" | "criterion" | "reference"

export type AnyNode = IssueNode | ClaimNode | ArgumentNode | CriterionNode | ReferenceNode

export interface GraphStore {
  graph: Graph

  addIssue: (partial?: Partial<IssueNode>) => string
  addClaim: (partial?: Partial<ClaimNode>) => string
  addArgument: (partial?: Partial<ArgumentNode>) => string
  addCriterion: (partial?: Partial<CriterionNode>) => string
  addReference: (partial: Partial<ReferenceNode> & { title: string }) => string

  updateNode: (id: string, updates: Record<string, unknown>) => void
  setNodePosition: (id: string, position: Position) => void
  setNodePositions: (positions: Map<string, Position>) => void
  deleteNode: (id: string) => void

  addEdge: (kind: EdgeKind, from: string, to: string) => string
  updateEdge: (id: string, updates: Partial<Edge>) => void
  deleteEdge: (id: string) => void

  /**
   * 指定した Claim に alternative-to で繋がる他の Claim ID を返す。
   * 対称関係なので from/to 両方を探索する。
   */
  getAlternativesOf: (claimId: string) => string[]
  /**
   * 複数 Claim の status を一括更新する。
   * 既に同じ status の Claim はスキップ (structural_version の無駄なインクリメント防止)。
   */
  bulkUpdateClaimStatus: (
    ids: string[],
    status: ClaimNode["status"],
    options?: { onlyIfStatus?: ClaimNode["status"] },
  ) => void

  applySemanticAnalysis: (result: SemanticAnalysisResult) => void
  /**
   * skill が事前計算して JSON に焼き込んだ semantic 結果を取り込む。
   * fixture 内の *Ref は ExtractionResult.ref (UUID ではない) を指すため、
   * applyExtraction が返す ref→UUID マップで再マップしてから
   * applySemanticAnalysis に委譲する。
   */
  applyStoredSemantic: (semantic: SemanticAnalysisResult, refToId: Map<string, string>) => void

  /**
   * 指定 Claim にぶら下がる semantic_drift signal を semantic_signals から取り除く。
   * 次回 semantic-analyze で drift が再検出されれば再表示される (sticky 抑止ではない)。
   * 動線: SidePanel の論点ズレ callout → 「無視」ボタン。
   */
  dismissDriftSignal: (claimId: string) => void

  /**
   * 接続先見直し候補を受けて Argument を別 Claim に付け替える。
   * - 現存する supports/attacks エッジを差し替え
   * - Argument.kind を新 candidateKind に合わせて更新 (supports→pro, attacks→con)
   * - misplacement_suggestion をクリア
   */
  reattachArgument: (argId: string, newClaimId: string, newKind: "supports" | "attacks") => void
  dismissMisplacementSuggestion: (argId: string) => void

  importGraph: (graph: Graph) => void
  reset: () => void
}

function applyToAllNodeArrays(graph: Graph, fn: <T extends AnyNode>(nodes: T[]) => T[]): Graph {
  return {
    ...graph,
    issues: fn(graph.issues),
    claims: fn(graph.claims),
    arguments: fn(graph.arguments),
    criteria: fn(graph.criteria),
    references: fn(graph.references),
  }
}

export const useGraphStore = create<GraphStore>()(
  persist(
    temporal(
      (set, get) => ({
        graph: emptyGraph,

        addIssue: (partial = {}) => {
          const id = newId()
          const node: IssueNode = {
            id,
            text: "新しい議題",
            status: "open",
            ...partial,
          }
          set((state) => ({
            graph: incrementStructural({
              ...state.graph,
              issues: [...state.graph.issues, node],
            }),
          }))
          return id
        },

        addClaim: (partial = {}) => {
          const id = newId()
          const node: ClaimNode = {
            id,
            text: "新しい主張",
            status: "unresolved",
            confidence: "moderate",
            support_count: 0,
            attack_count: 0,
            unanswered_attacks: 0,
            ...partial,
          }
          set((state) => ({
            graph: incrementStructural({
              ...state.graph,
              claims: [...state.graph.claims, node],
            }),
          }))
          return id
        },

        addArgument: (partial = {}) => {
          const id = newId()
          const node: ArgumentNode = {
            id,
            kind: "pro",
            data: [],
            ...partial,
          }
          set((state) => ({
            graph: incrementStructural({
              ...state.graph,
              arguments: [...state.graph.arguments, node],
            }),
          }))
          return id
        },

        addCriterion: (partial = {}) => {
          const id = newId()
          const node: CriterionNode = {
            id,
            text: "新しい評価基準",
            ...partial,
          }
          set((state) => ({
            graph: incrementStructural({
              ...state.graph,
              criteria: [...state.graph.criteria, node],
            }),
          }))
          return id
        },

        addReference: (partial) => {
          const id = newId()
          const node: ReferenceNode = {
            ...partial,
            id,
            title: partial.title,
          }
          set((state) => ({
            graph: incrementStructural({
              ...state.graph,
              references: [...state.graph.references, node],
            }),
          }))
          return id
        },

        updateNode: (id, updates) => {
          set((state) => {
            const nextGraph = incrementStructural(
              applyToAllNodeArrays(state.graph, (nodes) =>
                nodes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
              ),
            )

            // Argument の kind 変更時に、その argument が from の
            // supports/attacks エッジを新しい kind に追従させる。
            if (updates.kind === "pro" || updates.kind === "con") {
              const isArgument = nextGraph.arguments.some((a) => a.id === id)
              if (isArgument) {
                const targetEdgeKind: EdgeKind = updates.kind === "pro" ? "supports" : "attacks"
                nextGraph.edges = nextGraph.edges.map((e) =>
                  e.from === id && (e.kind === "supports" || e.kind === "attacks")
                    ? { ...e, kind: targetEdgeKind }
                    : e,
                )
              }
            }

            return { graph: nextGraph }
          })
        },

        setNodePosition: (id, position) => {
          set((state) => ({
            // Position changes do not bump structural_version (purely visual).
            graph: applyToAllNodeArrays(state.graph, (nodes) =>
              nodes.map((n) => (n.id === id ? { ...n, position } : n)),
            ),
          }))
        },

        setNodePositions: (positions) => {
          set((state) => ({
            graph: applyToAllNodeArrays(state.graph, (nodes) =>
              nodes.map((n) => {
                const pos = positions.get(n.id)
                return pos ? { ...n, position: pos } : n
              }),
            ),
          }))
        },

        deleteNode: (id) => {
          set((state) => ({
            graph: incrementStructural({
              ...applyToAllNodeArrays(state.graph, (nodes) => nodes.filter((n) => n.id !== id)),
              edges: state.graph.edges.filter((e) => e.from !== id && e.to !== id),
            }),
          }))
        },

        addEdge: (kind, from, to) => {
          const id = newId()
          const edge: Edge = { id, kind, from, to }
          set((state) => ({
            graph: incrementStructural({
              ...state.graph,
              edges: [...state.graph.edges, edge],
            }),
          }))
          return id
        },

        updateEdge: (id, updates) => {
          set((state) => ({
            graph: incrementStructural({
              ...state.graph,
              edges: state.graph.edges.map((e) => (e.id === id ? { ...e, ...updates } : e)),
            }),
          }))
        },

        deleteEdge: (id) => {
          set((state) => ({
            graph: incrementStructural({
              ...state.graph,
              edges: state.graph.edges.filter((e) => e.id !== id),
            }),
          }))
        },

        getAlternativesOf: (claimId) => {
          const state = get()
          const ids: string[] = []
          for (const e of state.graph.edges) {
            if (e.kind !== "alternative-to") continue
            if (e.from === claimId) ids.push(e.to)
            else if (e.to === claimId) ids.push(e.from)
          }
          return ids
        },

        bulkUpdateClaimStatus: (ids, status, options) => {
          const idSet = new Set(ids)
          set((state) => {
            const claims = state.graph.claims.map((c) => {
              if (!idSet.has(c.id)) return c
              if (options?.onlyIfStatus && c.status !== options.onlyIfStatus) return c
              if (c.status === status) return c // no-op
              return { ...c, status }
            })
            // 変更が無ければ structural_version を上げない
            const changed = claims.some((c, i) => c !== state.graph.claims[i])
            if (!changed) return state
            return {
              graph: incrementStructural({
                ...state.graph,
                claims,
              }),
            }
          })
        },

        applySemanticAnalysis: (result) => {
          set((state) => {
            // LLM が無効な ID を返す可能性があるため、graph に存在する ID だけ採用
            const argIds = new Set(state.graph.arguments.map((a) => a.id))
            const claimIds = new Set(state.graph.claims.map((c) => c.id))
            const issueIds = new Set(state.graph.issues.map((i) => i.id))

            // misplacement 候補 (argumentRef と candidateClaimRef が共に存在)
            // 古いペイロードや mock で misplacementFindings が無い場合への defensive
            const misplacementFindings = result.misplacementFindings ?? []
            const misplacementByArg = new Map(
              misplacementFindings
                .filter((m) => argIds.has(m.argumentRef) && claimIds.has(m.candidateClaimRef))
                .map((m) => [
                  m.argumentRef,
                  {
                    candidate_claim_id: m.candidateClaimRef,
                    candidate_kind: m.candidateKind,
                    reason: m.reason,
                  },
                ]),
            )

            // 各 Argument に misplacement_suggestion を反映
            // (前回の suggestion は今回該当が無ければクリア = 上書き方式)
            const updatedArgs = state.graph.arguments.map((a) => {
              const misplacement = misplacementByArg.get(a.id)
              return {
                ...a,
                misplacement_suggestion: misplacement,
              }
            })

            const now = new Date().toISOString()
            // 論点ズレ（両 ID とも graph に存在するもののみ）
            const driftSignals: Signal[] = result.driftFindings
              .filter((d) => claimIds.has(d.claimRef) && issueIds.has(d.issueRef))
              .map((d) => ({
                kind: "semantic_drift",
                affected_node_ids: [d.claimRef, d.issueRef],
                computed_at: now,
                source: "semantic",
              }))

            // misplacement シグナル (考慮漏れシグナル UI に出すため)
            const misplacementSignals: Signal[] = misplacementFindings
              .filter((m) => argIds.has(m.argumentRef) && claimIds.has(m.candidateClaimRef))
              .map((m) => ({
                kind: "misplaced_argument",
                affected_node_ids: [m.argumentRef, m.candidateClaimRef],
                computed_at: now,
                source: "semantic",
              }))

            return {
              graph: {
                ...state.graph,
                arguments: updatedArgs,
                semantic_signals: [...driftSignals, ...misplacementSignals],
                analysis_state: {
                  ...state.graph.analysis_state,
                  is_semantic_stale: false,
                  semantic_version: state.graph.analysis_state.structural_version,
                  semantic_analyzed_at: now,
                },
              },
            }
          })
        },

        applyStoredSemantic: (semantic, refToId) => {
          const remap = (ref: string) => refToId.get(ref) ?? ref
          get().applySemanticAnalysis({
            driftFindings: semantic.driftFindings.map((d) => ({
              ...d,
              claimRef: remap(d.claimRef),
              issueRef: remap(d.issueRef),
            })),
            misplacementFindings: (semantic.misplacementFindings ?? []).map((m) => ({
              ...m,
              argumentRef: remap(m.argumentRef),
              candidateClaimRef: remap(m.candidateClaimRef),
            })),
          })
        },

        dismissDriftSignal: (claimId) => {
          set((state) => {
            const existing = state.graph.semantic_signals ?? []
            const next = existing.filter(
              (s) => !(s.kind === "semantic_drift" && s.affected_node_ids[0] === claimId),
            )
            if (next.length === existing.length) return state
            return {
              graph: {
                ...state.graph,
                semantic_signals: next,
              },
            }
          })
        },

        reattachArgument: (argId, newClaimId, newKind) => {
          set((state) => {
            const claimExists = state.graph.claims.some((c) => c.id === newClaimId)
            const argExists = state.graph.arguments.some((a) => a.id === argId)
            if (!claimExists || !argExists) return state

            // 既存の supports/attacks エッジを差し替える (1 本想定)
            // 複数あれば全部新ターゲットに向ける (argos では 1 Argument = 1 target が前提)
            const updatedEdges = state.graph.edges.map((e) => {
              if (e.from !== argId) return e
              if (e.kind !== "supports" && e.kind !== "attacks") return e
              return { ...e, kind: newKind, to: newClaimId }
            })

            // Argument.kind を新 kind に合わせて更新 + misplacement_suggestion をクリア
            const updatedArgs = state.graph.arguments.map((a) => {
              if (a.id !== argId) return a
              const { misplacement_suggestion: _ignored, ...rest } = a
              return {
                ...rest,
                kind: newKind === "supports" ? "pro" : "con",
              } as ArgumentNode
            })

            return {
              graph: incrementStructural({
                ...state.graph,
                edges: updatedEdges,
                arguments: updatedArgs,
              }),
            }
          })
        },

        dismissMisplacementSuggestion: (argId) => {
          set((state) => ({
            graph: {
              ...state.graph,
              arguments: state.graph.arguments.map((a) => {
                if (a.id !== argId) return a
                const { misplacement_suggestion: _ignored, ...rest } = a
                return rest as ArgumentNode
              }),
            },
          }))
        },

        importGraph: (graph) => {
          set({ graph })
        },

        reset: () => {
          set({ graph: emptyGraph })
        },
      }),
      {
        // 履歴は graph 部分の変更だけ追う（actions も含まれた状態全体ではなく）
        partialize: (state) => ({ graph: state.graph }),
        // 同じ graph reference は重複扱いしない（zustand の set で新 ref になるためデフォで OK）
        limit: 50,
      },
    ),
    {
      name: "argos-graph",
      version: 2,
      // 永続化対象は graph のみ（temporal 履歴は永続化しない）
      partialize: (state) => ({ graph: state.graph }),
    },
  ),
)
