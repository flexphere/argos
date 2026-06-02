#!/usr/bin/env node
// skill 配布用バンドラ。`scripts/save-fixture.ts` と依存 (`src/schema/*`, zod) を
// 1 つの ESM ファイルに bundle して `.claude/skills/argos/scripts/save-fixture.mjs`
// に書き出す。
//
// 目的: skill を monorepo の `src/` 配下に非依存な「self-contained ディレクトリ」
//       に固める。`.claude/skills/argos/` だけを plugin として配布しても動く状態
//       にする。LLM 推論は親 Claude Code セッション側で in-context に行うため、
//       このバンドルは zod 検証 + JSON 書き出しのみを担う。
//
// 使い方:
//   pnpm build:skill
//
// 出力先のファイルは Git track 対象とし、配布時に常に最新が含まれる状態を保つ。

import { mkdirSync, rmSync } from "node:fs"
import path from "node:path"
import { build } from "esbuild"

const OUT = ".claude/skills/argos/scripts/save-fixture.mjs"
const OLD = ".claude/skills/argos/scripts/build-fixture.mjs"

mkdirSync(path.dirname(OUT), { recursive: true })

// 旧 bundle が残っていれば掃除 (LLM 呼び出しを含むため絶対に残してはいけない)
try {
  rmSync(OLD)
  console.log(`✓ removed legacy bundle: ${OLD}`)
} catch {
  // 元から無ければ無視
}

const result = await build({
  entryPoints: ["scripts/save-fixture.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  outfile: OUT,
  // Node 組み込みは実行環境で解決させる。npm パッケージ (zod 等) はバンドルに含める。
  external: ["node:*"],
  legalComments: "none",
  banner: {
    js: "#!/usr/bin/env node",
  },
  metafile: true,
})

const bytes = Object.values(result.metafile.outputs).reduce((s, o) => s + o.bytes, 0)
console.log(`✓ bundled → ${OUT} (${(bytes / 1024).toFixed(1)} KB)`)
