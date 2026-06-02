# argos

会議の議論を **IBIS 系のネットワークグラフ**として可視化するツール。Notion AI Meeting Notes 等の議事録を Claude Code の skill 側で構造化 JSON に変換し、ブラウザは静的サイトとしてその JSON を読み込み React Flow に描画する。

**🚀 ホスト版: https://flexphere.github.io/argos/**（main push で自動 deploy）

## できること

- 議論を **Issue / Claim / Argument / Criterion / Reference** として構造化
- グラフから「議論の穴」を自動検出
  - 未根拠の主張 / 未応答の反論 / 評価基準の不一致
  - 論点ズレ / 接続先見直し候補（skill 側で意味分析を回した場合）
  - 採用検討の余地あり / 代替案が同時 agreed 等
- ブラウザは **LLM・API サーバーに依存しない**（完全静的、GitHub Pages / S3 / GCS 等にデプロイ可）

## 使い方

### ブラウザ（手動編集 / JSON 読み込み）

ホスト版 https://flexphere.github.io/argos/ にアクセスして:

- 手動編集で Issue/Claim/Argument を直接組む
- skill が生成した JSON を **Import → JSON ファイルから** で読み込む

自前でホストしたい場合は [ビルド・デプロイ](#ビルド・デプロイ) を参照。

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
3. 任意で意味分析（論点ズレ / 接続先見直し候補）を同セッションで生成
4. zod 検証 + cwd 直下の `extractions/<page-id>.json` に保存

生成された JSON をホスト版ブラウザの **Import → JSON ファイルから** で開く。

### 開発

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

skill 用バンドル (zod 検証 + 保存スクリプト) を再生成:

```bash
pnpm build:skill  # → .claude/skills/argos/scripts/save-fixture.mjs
```

## ビルド・デプロイ

main push で `https://flexphere.github.io/argos/` に自動 deploy される (`.github/workflows/deploy.yml`)。

自前でホストするには:

```bash
pnpm build                                  # out/ に静的サイトを出力 (ルート配信)
NEXT_PUBLIC_BASE_PATH=/foo/argos pnpm build # サブパス配信時
```

`out/` を任意の static ホスティング (S3 / GCS / Cloudflare Pages 等) にアップロードする。

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

- **Browser**: Next.js (App Router static export) / React Flow / Zustand / zod
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
| `pnpm dev` | 開発サーバ |
| `pnpm build` | 静的 export |
| `npm test` | Vitest unit |
| `npx playwright test` | E2E |
| `npx tsc --noEmit` | 型チェック |
| `npx biome check .` | Lint |
| `npx biome format --write .` | フォーマット |
| `npm run check:dead` | 未使用 export 検出 (knip) |

`/quality-check` skill で全 sensor を一括実行。

## 開発ガイド

AI Agent 向けの詳細な作業ガイド（コーディング規約・層責務・ワークフロー）は [`CLAUDE.md`](./CLAUDE.md)。Cursor / Aider / Copilot 等は `AGENTS.md` symlink から同内容を参照。
