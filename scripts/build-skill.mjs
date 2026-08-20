#!/usr/bin/env node
// skill 配布用バンドラ。`scripts/*.ts` と依存 (`src/schema/*`, zod) をそれぞれ
// 1 つの ESM ファイルに bundle して `.claude/skills/argos/scripts/` に書き出す。
//
// 目的: skill を monorepo の `src/` 配下に非依存な「self-contained ディレクトリ」
//       に固める。`.claude/skills/argos/` だけを plugin として配布しても動く状態
//       にする。LLM 推論は親 Claude Code セッション側で in-context に行うため、
//       これらのバンドルは zod 検証 + ファイル書き出しのみを担う。
//
// 使い方:
//   pnpm build:skill
//
// 出力先のファイルは Git track 対象とし、配布時に常に最新が含まれる状態を保つ。
// 鮮度は CI (.github/workflows/ci.yml) が検証する。エントリを増やしたら
// CI 側のパス一覧にも追加すること。

import { mkdirSync, rmSync } from "node:fs"
import path from "node:path"
import { build } from "esbuild"

const OUT_DIR = ".claude/skills/argos/scripts"

/** entry → 出力ファイル名 */
const ENTRIES = [
  { entry: "scripts/save-fixture.ts", out: `${OUT_DIR}/save-fixture.mjs` },
  { entry: "scripts/embed-fixture.ts", out: `${OUT_DIR}/embed-fixture.mjs` },
]

const OLD = `${OUT_DIR}/build-fixture.mjs`

mkdirSync(OUT_DIR, { recursive: true })

// 旧 bundle が残っていれば掃除 (LLM 呼び出しを含むため絶対に残してはいけない)
try {
  rmSync(OLD)
  console.log(`✓ removed legacy bundle: ${OLD}`)
} catch {
  // 元から無ければ無視
}

for (const { entry, out } of ENTRIES) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    outfile: out,
    // Node 組み込みは実行環境で解決させる。npm パッケージ (zod 等) はバンドルに含める。
    external: ["node:*"],
    legalComments: "none",
    banner: {
      js: "#!/usr/bin/env node",
    },
    metafile: true,
  })

  const bytes = Object.values(result.metafile.outputs).reduce((s, o) => s + o.bytes, 0)
  console.log(`✓ bundled → ${out} (${(bytes / 1024).toFixed(1)} KB)`)
}
