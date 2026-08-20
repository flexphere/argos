// Skill 用 CLI: save-fixture が書き出した fixture JSON を、plugin 同梱の
// テンプレート HTML に焼き込んで配布用の単一 HTML を作る。
//
// このファイルは esbuild で `.claude/skills/argos/scripts/embed-fixture.mjs` に
// bundle して配布する (build:skill スクリプト)。LLM は呼ばない。
//
// 使い方:
//   node .claude/skills/argos/scripts/embed-fixture.mjs \
//     --fixture extractions/<page-id>.json \
//     --template <CLAUDE_PLUGIN_ROOT>/.claude/skills/argos/assets/argos.html \
//     --out extractions/<page-id>.html
//
// 出力した HTML はブラウザで開くだけでグラフが表示される (Import 操作不要)。
// 詳細は docs/adr/0003-embed-data-in-html.md。

import { readFileSync, writeFileSync } from "node:fs"
import { ZodError } from "zod"
import { EMBEDDED_DATA_ELEMENT_ID, escapeForScriptTag } from "../src/schema/embedded"
import { extractionResultSchema } from "../src/schema/extraction"
import { semanticAnalysisSchema } from "../src/schema/semantic"

interface Args {
  fixtureFile: string
  templateFile: string
  outFile: string
}

function parseArgs(): Args {
  const a: Partial<Args> = {}
  for (let i = 2; i < process.argv.length; i++) {
    const k = process.argv[i]
    if (k === "--fixture") a.fixtureFile = process.argv[++i]
    else if (k === "--template") a.templateFile = process.argv[++i]
    else if (k === "--out") a.outFile = process.argv[++i]
    else {
      console.error(`unknown argument: ${k}`)
      process.exit(1)
    }
  }
  if (!a.fixtureFile || !a.templateFile || !a.outFile) {
    console.error("Usage: embed-fixture --fixture <path> --template <path> --out <path>")
    process.exit(1)
  }
  return a as Args
}

/**
 * 焼き込む前に検証する。壊れたデータを HTML に固めてしまうと、
 * 開くまで気付けないうえ差し替えも効かないため。
 */
function validateFixture(raw: unknown): void {
  try {
    extractionResultSchema.parse(raw)
  } catch (e) {
    if (e instanceof ZodError) {
      const lines = e.issues.map((iss) => {
        const at = iss.path.length === 0 ? "(root)" : iss.path.join(".")
        return `  - ${at}: ${iss.message}`
      })
      throw new Error(`fixture の zod 検証エラー:\n${lines.join("\n")}`)
    }
    throw e
  }

  const semantic = (raw as { semantic?: unknown }).semantic
  if (semantic !== undefined) {
    const parsed = semanticAnalysisSchema.safeParse(semantic)
    if (!parsed.success) {
      // ブラウザ側も semantic は safeParse して無視する作りなので、
      // ここでも致命的にはしない (抽出結果だけでも配布できたほうがよい)。
      console.error("⚠ semantic フィールドが想定形式と異なります。そのまま埋め込みます。")
    }
  }
}

function main(): void {
  const args = parseArgs()

  const fixtureText = readFileSync(args.fixtureFile, "utf8")
  let fixture: unknown
  try {
    fixture = JSON.parse(fixtureText)
  } catch (e) {
    throw new Error(
      `JSON parse 失敗: ${args.fixtureFile}\n${e instanceof Error ? e.message : String(e)}`,
    )
  }
  validateFixture(fixture)

  const template = readFileSync(args.templateFile, "utf8")

  // アプリ本体の script より前にパースされることを保証するため head に置く。
  const marker = "</head>"
  const at = template.indexOf(marker)
  if (at === -1) {
    throw new Error(`テンプレートに ${marker} が見つかりません: ${args.templateFile}`)
  }

  // 既に焼き込み済みのテンプレートを二重に加工しないよう弾く。
  if (template.includes(`id="${EMBEDDED_DATA_ELEMENT_ID}"`)) {
    throw new Error(
      `テンプレートには既に埋め込みデータがあります。素の argos.html を指定してください: ${args.templateFile}`,
    )
  }

  const payload = escapeForScriptTag(JSON.stringify(fixture))
  const tag = `<script type="application/json" id="${EMBEDDED_DATA_ELEMENT_ID}">${payload}</script>`
  const html = template.slice(0, at) + tag + template.slice(at)

  writeFileSync(args.outFile, html, "utf8")

  const counts = fixture as { issues?: unknown[]; claims?: unknown[]; arguments?: unknown[] }
  console.error(`✓ embedded: ${args.outFile} (${(html.length / 1024).toFixed(1)} KB)`)
  process.stdout.write(
    `OK out=${args.outFile} issues=${counts.issues?.length ?? 0} claims=${counts.claims?.length ?? 0} arguments=${counts.arguments?.length ?? 0}`,
  )
}

try {
  main()
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
}
