# argos

会議の議論を **IBIS 系のネットワークグラフ**として可視化するツール。Notion AI Meeting Notes 等の議事録を Claude Code の skill 側で構造化 JSON に変換し、ブラウザは静的サイトとしてその JSON を読み込み React Flow に描画する。

## できること

- 議論を **Issue / Claim / Argument / Criterion / Reference** として構造化
- グラフから「議論の穴」を自動検出
  - 未根拠の主張 / 未応答の反論 / 評価基準の不一致
  - 論点ズレ / 接続先見直し候補（skill 側で意味分析を回した場合）
  - 採用検討の余地あり / 代替案が同時 agreed 等
- ブラウザは **LLM・API サーバーに依存しない**（完全静的、S3 / GCS 等にデプロイ可）

## 使い方

### ブラウザ

任意の静的サイトとして配信（ホスト先は何でも可）し、開く。

- 手動編集して構造を組む
- 既存 JSON を **Import → JSON ファイルから** で読み込む

ローカル試用なら開発手順 (`pnpm dev`) を参照。

### Notion ページから生成 (Claude Code plugin)

Claude Code の plugin として配布。インストール手順:

```
/plugin marketplace add flexphere/argos
/plugin install argos@argos
```

インストール後、Claude Code 上で:

```
/argos <notion-url>
```

skill が以下を実行する:

1. Notion から MCP 経由で transcript を取得
2. `claude -p` 経由で LLM 抽出（+任意で意味分析）
3. cwd 直下の `extractions/<page-id>.json` に保存

生成された JSON をブラウザの **Import → JSON ファイルから** で開く。

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

```bash
pnpm build         # out/ に静的サイトを出力
```

サブパス配信時:

```bash
NEXT_PUBLIC_BASE_PATH=/foo/argos pnpm build
# out/ を任意の static ホスティング (S3 / GCS / Cloudflare 等) にアップロード
```

## アーキテクチャ

```
[Claude Code skill /argos]                  [Browser (argos)]
  Notion URL                                  手動編集 or
   ↓                                          Import → JSON ファイル
  MCP で取得                                    ↓
   ↓                                          形式判定 (Export / fixture)
  LLM 抽出 (+意味分析)                          ↓
   ↓                                          React Flow で描画
  extractions/<id>.json
```

- **Browser**: Next.js (App Router static export) / React Flow / Zustand / zod
- **Skill**: `claude -p` サブプロセス + Notion MCP コネクタ
- レイヤー分離（schema / store / graph / ui / io / llm / signals）の依存方向は `tests/architecture/dependencies.test.ts` で機械検証

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
