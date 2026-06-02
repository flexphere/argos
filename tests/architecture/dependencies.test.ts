import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * モジュール境界テスト。
 *
 * CLAUDE.md §3 の依存方向ルールを TypeScript の import 解析でテストする。
 * - `src/schema/` は src 内の他モジュールに依存しない (純粋型)
 * - `src/store/` は UI 層に依存しない
 * - `src/graph/` は UI 層を参照しない (UI 側から graph を参照する)
 * - `src/io/` は schema / store / graph を参照、UI と signals には依存しない
 *
 * 検出方法: src 配下の .ts/.tsx を走査し、相対 import 先のモジュールを
 * 引いて、forbidden リストに含まれていれば違反として収集。
 *
 * 注: LLM 推論は skill (`.claude/skills/argos/`) 内で in-context で行うため
 * `src/llm/` モジュールは存在しない。プロンプトとスキーマは reference MD と
 * `src/schema/` に分かれて配置される。
 */

const SRC_ROOT = join(__dirname, "..", "..", "src")

/** トップレベルのモジュールディレクトリ名 (src/ 直下) */
type ModuleName = "schema" | "store" | "graph" | "ui" | "io" | "signals"

const MODULE_NAMES: ModuleName[] = ["schema", "store", "graph", "ui", "io", "signals"]

/**
 * モジュールが import してはいけない他モジュール一覧。
 * 既存コードが既に守っている状態だけを enforce する。
 */
const FORBIDDEN: Record<ModuleName, ModuleName[]> = {
  // schema は純粋型なので src 内の他モジュールに一切依存しない
  schema: ["store", "graph", "ui", "io", "signals"],

  // store は React や UI に依存しない (現状は graph も参照しない設計)
  store: ["ui"],

  // graph は UI 層を参照しない (UI 側から graph を呼ぶ)
  graph: ["ui"],

  // ui に追加の forbidden は無い (現状は graph / store / signals / io を参照)
  ui: [],

  // io は外部データ <-> 内部状態の橋渡し層なので、schema / store / graph を
  // 自由に参照できる。ただし UI と signals には依存しない。
  io: ["ui", "signals"],

  // signals は schema にのみ依存 (構造シグナルは graph データを直接読まない設計)
  signals: ["store", "graph", "ui", "io"],
}

interface Violation {
  from: string
  fromModule: ModuleName
  to: string
  toModule: ModuleName
}

function collectSourceFiles(dir: string): string[] {
  const result: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      result.push(...collectSourceFiles(fullPath))
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      result.push(fullPath)
    }
  }
  return result
}

function moduleOf(filePath: string): ModuleName | null {
  for (const name of MODULE_NAMES) {
    if (filePath.includes(`/src/${name}/`)) return name
  }
  return null
}

/**
 * import 文を抽出する。
 * type import / 値 import / re-export ('export ... from') の全てを拾う。
 */
function extractImports(content: string): string[] {
  const imports: string[] = []
  // import ... from "x"
  const importRe = /import\s+(?:type\s+)?[^"']*from\s+["']([^"']+)["']/g
  // export ... from "x" (re-export)
  const reexportRe = /export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g
  for (const re of [importRe, reexportRe]) {
    let m: RegExpExecArray | null
    // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
    while ((m = re.exec(content)) !== null) {
      imports.push(m[1])
    }
  }
  return imports
}

function resolveImport(fromFile: string, importPath: string): string | null {
  if (!importPath.startsWith(".")) return null // npm package など外部 import
  const base = join(dirname(fromFile), importPath)
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c
    } catch {
      // 次の候補
    }
  }
  return null
}

describe("architecture: src/ のモジュール境界", () => {
  it("forbidden な依存関係を持たない", () => {
    const violations: Violation[] = []
    const files = collectSourceFiles(SRC_ROOT)

    for (const file of files) {
      const fromMod = moduleOf(file)
      if (!fromMod) continue // src 直下 (App.tsx 等) はスキップ
      const forbiddenList = FORBIDDEN[fromMod]
      if (!forbiddenList || forbiddenList.length === 0) continue

      const content = readFileSync(file, "utf8")
      const imports = extractImports(content)
      for (const imp of imports) {
        const resolvedPath = resolveImport(file, imp)
        if (!resolvedPath) continue
        const toMod = moduleOf(resolvedPath)
        if (!toMod) continue
        if (forbiddenList.includes(toMod)) {
          violations.push({
            from: relative(SRC_ROOT, file),
            fromModule: fromMod,
            to: relative(SRC_ROOT, resolvedPath),
            toModule: toMod,
          })
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.from} (${v.fromModule}) → ${v.to} (${v.toModule})`)
        .join("\n")
      throw new Error(
        `Found ${violations.length} module boundary violations:\n${msg}\n\nsee CLAUDE.md §2 and tests/architecture/dependencies.test.ts for rules`,
      )
    }

    expect(violations).toEqual([])
  })

  it("各モジュールの想定パスが実在し、走査対象にファイルが見つかること (smoke)", () => {
    const files = collectSourceFiles(SRC_ROOT)
    expect(files.length).toBeGreaterThan(10) // src には多数のファイルがある想定
    for (const name of MODULE_NAMES) {
      const inModule = files.filter((f) => f.includes(`/src/${name}/`))
      expect(inModule.length, `${name} に対象ファイルが無い`).toBeGreaterThan(0)
    }
  })
})
