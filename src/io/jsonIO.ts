import { CURRENT_SCHEMA_VERSION, type ExportRoot, type Graph, exportRootSchema } from "../schema"
import { type ExtractionResult, extractionResultSchema } from "../schema/extraction"
import { type SemanticAnalysisResult, semanticAnalysisSchema } from "../schema/semantic"

interface BuildOptions {
  meetingTitle?: string
  meetingDate?: string
  participants?: string[]
  includeTranscript?: boolean
}

export function buildExportRoot(graph: Graph, options: BuildOptions = {}): ExportRoot {
  return {
    $schema_version: CURRENT_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    source: {
      meeting_title: options.meetingTitle,
      date: options.meetingDate,
      participants: options.participants,
    },
    include_transcript: options.includeTranscript ?? false,
    graph,
  }
}

export function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: "application/json" })
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
 * Import で受け取る fixture 形式 (skill が出力する `extractions/<id>.json`)。
 * Export 形式 (graph 全体) とは別物で、こちらは抽出結果 + (任意) 事前計算した
 * semantic suggestion。ブラウザ側で applyExtraction + applyStoredSemantic を順に
 * 通して取り込む。
 */
export type ImportFixture = ExtractionResult & { semantic?: SemanticAnalysisResult }

export type ImportResult =
  | { kind: "export"; data: ExportRoot }
  | { kind: "fixture"; data: ImportFixture }

/**
 * Import 用 JSON のパース。export 形式 (`exportRoot`) と skill 生成の fixture 形式
 * (`StoredFixture`) のどちらでも受け付ける。形式判定は最上位キーで行う:
 *   - `$schema_version` あり → export
 *   - `issues` 配列あり → fixture
 *
 * 呼び出し側 (ImportMenu) は `kind` で分岐して
 *   - export → `importGraph(data.graph)`
 *   - fixture → `applyExtraction` + (semantic があれば) `applyStoredSemantic`
 * を実行する。
 */
export async function parseImportFile(file: File): Promise<ImportResult> {
  const text = await file.text()
  const json: unknown = JSON.parse(text)

  if (json && typeof json === "object" && "$schema_version" in json) {
    return { kind: "export", data: exportRootSchema.parse(json) }
  }

  const extraction = extractionResultSchema.parse(json)
  // semantic は壊れていても致命的ではないので safeParse して、失敗時は無視する。
  // 抽出だけでも取り込めた方が UX が良いという判断。
  let semantic: SemanticAnalysisResult | undefined
  const rawSemantic = (json as { semantic?: unknown }).semantic
  if (rawSemantic !== undefined) {
    const parsed = semanticAnalysisSchema.safeParse(rawSemantic)
    if (parsed.success) semantic = parsed.data
    else console.warn("semantic フィールドが想定形式と異なるため無視:", parsed.error.issues)
  }
  return { kind: "fixture", data: { ...extraction, semantic } }
}

export function defaultFilename(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `argos-${stamp}.json`
}
