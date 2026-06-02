// Skill 用 CLI: agent が in-context で生成した抽出結果 (+任意で意味分析) JSON を
// zod 検証し、ブラウザ用 fixture (`extractions/<page-id>.json`) に保存する。
//
// このファイルは esbuild で `.claude/skills/argos/scripts/save-fixture.mjs` に
// bundle して配布する (build:skill スクリプト)。LLM は呼ばない。
//
// 使い方:
//   node .claude/skills/argos/scripts/save-fixture.mjs \
//     --extraction-file <path> --page-id <id> [--semantic-file <path>]
//
// 入力 JSON 形式:
//   --extraction-file: ExtractionResult (src/schema/extraction.ts)
//   --semantic-file:   SemanticAnalysisResult (src/schema/semantic.ts)
//
// 出力:
//   extractions/<page-id>.json = { ...extraction, semantic? }
//   (ブラウザの Import → JSON ファイルから で取り込む)

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { ZodError, type ZodSchema } from "zod"
import { extractionResultSchema } from "../src/schema/extraction"
import { semanticAnalysisSchema } from "../src/schema/semantic"

interface Args {
  extractionFile: string
  pageId: string
  semanticFile?: string
}

function parseArgs(): Args {
  const a: Partial<Args> = {}
  for (let i = 2; i < process.argv.length; i++) {
    const k = process.argv[i]
    if (k === "--extraction-file") a.extractionFile = process.argv[++i]
    else if (k === "--page-id") a.pageId = process.argv[++i]
    else if (k === "--semantic-file") a.semanticFile = process.argv[++i]
    else {
      console.error(`unknown argument: ${k}`)
      process.exit(1)
    }
  }
  if (!a.extractionFile || !a.pageId) {
    console.error(
      "Usage: save-fixture --extraction-file <path> --page-id <id> [--semantic-file <path>]",
    )
    process.exit(1)
  }
  return a as Args
}

function readJson(filePath: string): unknown {
  const raw = readFileSync(filePath, "utf8")
  try {
    return JSON.parse(raw)
  } catch (e) {
    throw new Error(`JSON parse 失敗: ${filePath}\n${e instanceof Error ? e.message : String(e)}`)
  }
}

function validate<T>(schema: ZodSchema<T>, data: unknown, label: string): T {
  try {
    return schema.parse(data)
  } catch (e) {
    if (e instanceof ZodError) {
      const lines = e.issues.map((iss) => {
        const at = iss.path.length === 0 ? "(root)" : iss.path.join(".")
        return `  - ${at}: ${iss.message}`
      })
      throw new Error(`${label} の zod 検証エラー:\n${lines.join("\n")}`)
    }
    throw e
  }
}

function main(): void {
  const args = parseArgs()

  const extractionRaw = readJson(args.extractionFile)
  const extraction = validate(extractionResultSchema, extractionRaw, "ExtractionResult")
  console.error(
    `✓ extraction: issues=${extraction.issues.length} claims=${extraction.claims.length} arguments=${extraction.arguments.length}`,
  )

  let semantic: ReturnType<typeof validateSemantic> | undefined
  if (args.semanticFile) {
    const semanticRaw = readJson(args.semanticFile)
    semantic = validateSemantic(semanticRaw)
    console.error(
      `✓ semantic: drift=${semantic.driftFindings.length} misplaced=${semantic.misplacementFindings.length}`,
    )
  }

  const stored = semantic ? { ...extraction, semantic } : extraction
  const outDir = path.join(process.cwd(), "extractions")
  mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, `${args.pageId}.json`)
  writeFileSync(outPath, JSON.stringify(stored, null, 2), "utf8")
  console.error(`✓ saved: ${outPath}`)

  process.stdout.write(
    `OK page_id=${args.pageId} issues=${extraction.issues.length} claims=${extraction.claims.length} arguments=${extraction.arguments.length} semantic=${semantic ? "yes" : "no"}`,
  )
}

function validateSemantic(data: unknown) {
  return validate(semanticAnalysisSchema, data, "SemanticAnalysisResult")
}

try {
  main()
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
}
