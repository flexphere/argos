# argos

会議の議論を **IBIS 系のネットワークグラフ**として可視化するツール。Notion AI Meeting Notes 等の議事録を Claude Code の skill 側で構造化 JSON に変換し、ブラウザは静的サイトとしてその JSON を読み込み React Flow に描画する。

**🚀 ホスト版: https://flexphere.github.io/argos/**（main push で自動 deploy）

## できること

- 議論を **Issue / Claim / Argument / Criterion / Reference** として構造化
- グラフから「議論の穴」を自動検出
  - 未根拠の主張 / 未応答の反論 / 評価基準の不一致
  - 論点ズレ / 接続先見直し候補（skill 側で分析を回した場合）
  - 採用検討の余地あり / 代替案が同時 agreed 等
- ブラウザは **LLM・API サーバーに依存しない**（完全静的、GitHub Pages / S3 / GCS 等にデプロイ可）
- ビルド成果物は **`dist/index.html` 1 ファイルだけ**。JS/CSS が全て HTML にインライン化されるので、ダウンロードしてダブルクリックすればサーバー無しでそのまま開ける
- skill が生成する HTML には**議論データが焼き込まれている**ので、渡した相手は開くだけでグラフを見られる。編集したものは Export → HTML でまた 1 ファイルとして持ち出せる

## 使い方

### ブラウザ（手動編集 / JSON 読み込み）

ホスト版 https://flexphere.github.io/argos/ にアクセスして:

- 手動編集で Issue/Claim/Argument を直接組む
- skill が生成した JSON を **Import → JSON ファイルから** で読み込む

ホスト版の HTML をそのまま保存すれば、オフラインでも同じものが動く。自前でホストしたい場合は [ビルド・デプロイ](#ビルド・デプロイ) を参照。

### Notion ページから生成 (Claude Code plugin)

#### 前提条件

- Claude Code (CLI / IDE 拡張のいずれか) がインストール済
- `claude.ai` の **Notion インテグレーション**が対象ワークスペースで Approved（`mcp__claude_ai_Notion__notion-fetch` が動く状態）
- Node.js 22+ が PATH に存在

#### インストール

```
/plugin marketplace add flexphere/argos
/plugin install argos@argos
```

#### 実行

Claude Code 上で Notion ページの URL を渡す:

```
/argos <notion-url>
```

skill が以下を実行:

1. Notion から MCP 経由で transcript を取得
2. **親 Claude Code セッションが in-context で構造化** (LLM 推論はサブスク範囲内、`claude -p` 等のサブプロセス不要)
3. 任意で分析（論点ズレ / 接続先見直し候補）を同セッションで生成
4. zod 検証 + cwd 直下の `extractions/<page-id>.json` に保存
5. plugin 同梱のテンプレートに焼き込んで `extractions/<page-id>.html` を生成し、**デフォルトブラウザで開く**

**生成された HTML は開くだけで議論グラフが表示される。** Import 操作もネットワークも要らず、そのまま人に渡せる。

JSON も併せて残るので、別の argos に読み込ませたい場合は **Import → JSON ファイルから** で開ける。argos 本体は plugin に同梱されている (`<plugin のインストール先>/.claude/skills/argos/assets/argos.html`)。ホスト版 https://flexphere.github.io/argos/ でも同じものが動く。

### 開発

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

skill 用バンドル (zod 検証 + 保存スクリプト) を再生成:

```bash
pnpm build:skill  # → .claude/skills/argos/scripts/save-fixture.mjs
```

## ビルド・デプロイ

main push で `https://flexphere.github.io/argos/` に自動 deploy される (`.github/workflows/deploy.yml`)。

```bash
pnpm build   # → dist/index.html (1 ファイル / 約 545KB)
             #   同じものが .claude/skills/argos/assets/argos.html にも複製される
```

出力は **単一 HTML 1 枚**。外部アセット参照が無いので、置き場所を選ばない。

`.claude/skills/argos/assets/argos.html` は plugin 配布用に git track している。plugin 利用者がビルドせずに使えるようにするためで、CI が `pnpm build` の結果と一致するかを検証している（[ADR 0002](./docs/adr/0002-bundle-html-in-plugin.md)）。**`src/` を変更したら `pnpm build` して再生成し、併せて `.claude-plugin/plugin.json` の `version` を上げること。**

- **ローカルで開く**: `dist/index.html` をダブルクリックするだけ（`file://` で動く。サーバー不要）
- **配布する**: この 1 ファイルを渡せばそのまま動く
- **ホストする**: 任意の static ホスティング (S3 / GCS / Cloudflare Pages 等) に置く。サブパス配下でもパス調整は要らない

## アーキテクチャ

```
[Claude Code skill /argos]                  [Browser (argos)]
  Notion URL                                  手動編集 or
   ↓                                          Import → JSON ファイル
  MCP で取得 (notion-fetch)                     ↓
   ↓                                          形式判定 (Export / fixture)
  親セッションが in-context で                  ↓
  ExtractionResult を生成                     React Flow で描画
  (+ 任意で SemanticAnalysisResult)
   ↓
  zod 検証 + extractions/<id>.json
```

- **Browser**: Vite + React (単一 HTML ビルド) / React Flow / Zustand / zod
- **Skill**: 親 Claude Code セッションが in-context で抽出（`claude -p` サブプロセス不要、サブスク範囲内）。`scripts/save-fixture.mjs` が zod 検証 + JSON 書き出しのみ担当
- レイヤー分離 (schema / store / graph / ui / io / signals) の依存方向は `tests/architecture/dependencies.test.ts` で機械検証

## ドメインモデル

| ノード | 役割 |
|---|---|
| **Issue** | 解決すべき問い |
| **Claim** | Issue への立場・命題（agreed / unresolved / rejected / out-of-scope） |
| **Argument** | Claim を pro / con する根拠 |
| **Criterion** | 議論で使われた評価軸 |
| **Reference** | 持ち出された外部情報 |

エッジ: `addresses` / `supports` / `attacks` / `sub-issue-of` / `alternative-to` / `evaluates-by` / `cites`

## 開発コマンド

| コマンド | 用途 |
|---|---|
| `pnpm dev` | 開発サーバ (Vite) |
| `pnpm build` | 単一 HTML を出力 (`dist/index.html`) |
| `pnpm preview` | ビルド結果をローカル配信 |
| `npm test` | Vitest unit |
| `npx playwright test` | E2E |
| `npx tsc --noEmit` | 型チェック |
| `npx biome check .` | Lint |
| `npx biome format --write .` | フォーマット |
| `npm run check:dead` | 未使用 export 検出 (knip) |

`/quality-check` skill で全 sensor を一括実行。

## 開発ガイド

AI Agent 向けの詳細な作業ガイド（コーディング規約・層責務・ワークフロー）は [`CLAUDE.md`](./CLAUDE.md)。Cursor / Aider / Copilot 等は `AGENTS.md` symlink から同内容を参照。
