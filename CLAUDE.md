# CLAUDE.md — argos プロジェクトガイド (AI Agent 向け)

> Claude Code を始めとする AI コーディングエージェントが本リポジトリで作業を始めるときの最初に読むべきオリエンテーション文書。本ファイルは `AGENTS.md` からシンボリックリンクされている。

## 1. プロジェクト概要

**argos** は会議の議論を **IBIS 系のネットワークグラフ**として可視化するツール。Notion AI Meeting Notes 等の議事録を Claude Code の skill 側で構造化 JSON に変換し、ブラウザは静的サイトとして JSON を読んで React Flow に描画する。

- **ターゲット**: チーム内会議の質を上げたい開発者・PM
- **入力経路**:
  - 手動編集（UI で直接 Issue/Claim/Argument を追加）
  - Import → JSON ファイル（skill 出力 fixture または Export 形式 JSON のどちらでも）
- **検出シグナル**: 未根拠の主張 / 未応答の反論 / 論点ズレ / 接続先見直し候補 / 代替案の同時 agreed / 採用検討の余地あり 等

## 2. ドメインモデル

IBIS 系の Issue / Claim / Argument に Criterion / Reference を追加した形。

| ノード | 主要フィールド |
|---|---|
| **Issue** | `text`, `status` (`open`/`resolved`/`deferred`), `parent_ref` で親 Issue |
| **Claim** | `text`, `status` (`unresolved`/`agreed`/`rejected`/`out-of-scope`), `confidence`, support/attack カウント |
| **Argument** | `kind` (`pro`/`con`), `data: string[]`, `scope` (`general`/`exception`), `misplacement_suggestion` |
| **Criterion** | `text`, `weight` (`strong`/`moderate`/`weak`) |
| **Reference** | `title`, `uri`, `excerpt` |

エッジ:

- `addresses` (Claim → Issue)
- `supports` / `attacks` (Argument → Claim)
- `sub-issue-of` (Issue → Issue)
- `alternative-to` (Claim ↔ Claim、両立不可ペア)
- `evaluates-by` (Argument → Criterion)
- `cites` (Argument → Reference)

## 3. アーキテクチャ概観

```
app/                       Next.js App Router (静的 export)
├── layout.tsx
├── page.tsx
└── globals.css

src/                       アプリ本体
├── App.tsx                ルートコンポーネント
├── schema/                ドメイン型・zod スキーマ
├── graph/                 React Flow 周辺 (layout/customNodes/GraphCanvas)
├── store/                 Zustand ストア (graphStore + uiStore)
├── signals/               構造系 + 意味系シグナル検出
├── io/                    JSON / Markdown / Mermaid 入出力
└── ui/                    SidePanel / Modal / ImportMenu / ExportMenu 等

scripts/                   ビルドスクリプト
├── save-fixture.ts        skill 用 CLI: zod 検証 + extractions/<id>.json 書き出し (LLM 不要)
└── build-skill.mjs        save-fixture.ts を .mjs に bundle (pnpm build:skill)

.claude/skills/            Claude Code 用スキル
└── argos/                 Notion → JSON 生成スキル
    ├── SKILL.md
    ├── references/        in-context 抽出/意味分析のプロンプト + スキーマ説明
    └── scripts/           bundle 済 .mjs 群

.claude-plugin/            Claude Code plugin / marketplace メタデータ
├── plugin.json            plugin manifest (skill 探索パス: .claude/skills)
└── marketplace.json       self-listing marketplace（同一 repo を source: "./" で指す）

extractions/        Skill が出力する fixture JSON (.gitignore 済)

docs/
├── adr/                   Architecture Decision Records
├── plan/                  未着手プラン
└── research/              調査・分析
```

### 依存方向（機械検証あり）

- `schema/` は何にも依存しない（zod のみ）
- `store/` は schema 依存、UI 非依存
- `graph/` は schema + store を参照、UI 非依存
- `io/` は schema / store / graph に依存、UI と signals に非依存
- `signals/` は schema 依存のみ

`tests/architecture/dependencies.test.ts` で機械検証される。違反は CI / pre-commit で失敗する。

LLM 推論ロジックを保持する `src/llm/` モジュールは存在しない。プロンプトと JSON スキーマ説明は `.claude/skills/argos/references/*.md` に、zod スキーマは `src/schema/{extraction,semantic}.ts` に置き、推論自体は skill 実行時に親 Claude Code セッションが in-context で行う。

## 4. 責務分割（Skill ↔ Browser）

- **Claude Code skill (`/argos`)**: Notion 取得 (MCP) → transcript 抽出 → **親セッションが in-context で ExtractionResult / SemanticAnalysisResult を生成** → `scripts/save-fixture.mjs` で zod 検証 + `extractions/<id>.json` 保存
- **Browser (argos)**: 静的サイト。Import → JSON ファイル経由で skill 出力 JSON または Export 形式 JSON を読み込み、React Flow に描画。**LLM・API サーバーへの依存なし**

意味分析は skill 実行時にユーザーに「同時実行するか」を確認し、yes なら親セッションが `references/SEMANTIC_PROMPT.md` に従って生成、save-fixture が抽出結果と結合して書き出す。

### JSON 形式の判定（Import 経路）

`io/jsonIO.ts:parseImportFile` が最上位キーで判定:

- `$schema_version` あり → **Export 形式** (`exportRoot`)。`importGraph` で取り込み
- `issues` 配列あり → **Skill fixture 形式** (`ImportFixture` = `ExtractionResult & { semantic? }`)。`applyExtraction` で graph 構築、`semantic` があれば `applyStoredSemantic` で ref→UUID 再マップして適用

## 5. シグナル

### 構造シグナル（LLM 不要、graph トポロジーから検出）

| Kind | 意味 |
|---|---|
| `unanswered_attack` | 未応答の反論 |
| `unsupported_claim` | 未根拠の主張 |
| `criterion_mismatch` | 評価基準の不一致 |
| `orphan_argument` | 未接続の論証 |
| `unreachable_issue` | 主張なき議題 |
| `disconnected_criterion` | 未使用の評価基準 |
| `disconnected_reference` | 未引用の参照 |
| `agreed_alternatives_conflict` | 代替案 (`alternative-to`) が同時 agreed |
| `ready_to_agree` | 採用検討の余地あり |
| `term_inconsistency` | 用語の不整合 (将来) |

### 意味シグナル（skill が precompute、JSON に焼き込み）

| Kind | 意味 |
|---|---|
| `semantic_drift` | Claim と紐付く Issue の関連度が低い |
| `misplaced_argument` | Argument は別 Claim を pro/con した方が自然 |

意味分析は skill 実行時に親セッションが `references/SEMANTIC_PROMPT.md` の指示に従って in-context で 2 タスク (drift / misplacement) を生成する。出力は zod (`src/schema/semantic.ts`) で検証されてから fixture に焼き込まれる。ブラウザは結果を表示するだけ。

## 6. 共通コマンド

| コマンド | 用途 |
|---|---|
| `pnpm dev` | 開発サーバ起動 (`http://localhost:3000`) |
| `pnpm build` | 静的 export（`out/`） |
| `npm test` | Vitest unit テスト (1 回) |
| `npm run test:watch` | Vitest watch モード |
| `npx tsc --noEmit` | TypeScript 型チェック |
| `npx biome check .` | Lint チェック |
| `npx biome format --write .` | フォーマット |
| `npx playwright test --reporter=line` | E2E テスト |
| `npm run test:coverage` | カバレッジ取得 |
| `npm run check:dead` | 未使用 export 検出 (knip) |

全 sensor 一括は `/quality-check` skill。

### 非ルートパス配信

サブパス配信時は `NEXT_PUBLIC_BASE_PATH` を指定:

```bash
NEXT_PUBLIC_BASE_PATH=/foo/argos pnpm build
```

`next.config.ts` の `basePath` / `assetPrefix` と、`src/App.tsx` の独自 fetch URL に build 時に inline される。

### Pre-commit hook 活性化

`.husky/pre-commit` (lint-staged + tsc)。`git init` 済リポジトリで `pnpm install` を実行すると husky の prepare で hook が有効化される。

## 7. テスト方針

- コード変更時は対応するテストを足す（差分ベース）
- 純粋関数 / 型 / スキーマ → `tests/*.test.ts`
- UI / ユーザーフロー → `e2e/*.spec.ts`
- 既存テストを壊さない

## 8. コーディング規約

- **TypeScript strict**: `any` 禁止
- **Biome**: ダブルクォート / セミコロンなし / 100 行幅 / 2 スペースインデント
- **コメント方針**:
  - 既定: 書かない（識別子名で意図を表す）
  - 書く時の条件: WHY が自明でないとき、隠れた制約 / workaround / 仕様の根拠を残す
  - WHAT は書かない
- **スタイリング**:
  - インラインスタイルは CSS variable 参照（Catppuccin: Latte/Mocha、`app/globals.css` の semantic token）
  - ハードコード hex 禁止（mermaid 等の静的出力は例外）
- 層の責務を越境しない（§3 の依存方向）

## 9. AI Agent 作業時のワークフロー

### 9-1. 非自明な意思決定は ADR

「採用しなかった案」が複数ある決定は `docs/adr/NNNN-foo.md` として記録する（フォーマット: 背景・採用案・不採用案と理由・結果）。Status は `Proposed` → 検証 → `Accepted` で遷移。ファイル名は連番で。

### 9-2. 実装プラン

機能単位の作業計画が必要なら `docs/plan/foo.md` として書き起こす（背景・概要・受け入れ条件を含む単独着手可能な単位）。

### 9-3. Hydration mismatch

`localStorage` / `window.matchMedia` 値は **mount 後 useEffect** で State に反映する。`useState(loadStored)` だと SSR と client で値がズレる。
既存パターン: `useUIStore.themePreference`、`SidePanel.panelWidth`。

### 9-4. ConfirmDialog

破壊的操作の確認は `useUIStore.getState().showConfirm({ message, danger: true })` を await。`window.confirm` / `window.alert` は使わない。

### 9-5. テーマ対応

新規 UI は Light / Dark 両方で見え方を確認。色は `app/globals.css` の semantic token を増やす方向。

### 9-6. Sensor → Guides フィードバックループ

検出パターンが繰り返されたら CLAUDE.md / ADR にガイド化して再発を防ぐ:

1. 同じ修正を 2 回以上 → §8 規約や §10 やってはいけないこと に追記
2. `/code-review` で同カテゴリの指摘が 3 回以上 → ADR or ルール化
3. 機械化できる検出 → architecture-test / biome ルール追加

## 10. やってはいけないこと

- `git config` の更新、`git push --force`（明示指示時のみ）
- `git commit --no-verify`（フックを skip しない）
- 親ディレクトリ等への破壊的操作
- ハードコード hex を inline style に書く（CSS variable を使う）
- `window.confirm` / `window.alert` を新規追加（ConfirmDialog を使う）
- 抽出結果を直接 graph store に書き込む（`applyExtraction` を経由）
- テスト結果を見ずに「動いた」と報告する
- TypeScript エラーを無視する（`@ts-ignore` は最終手段）
- ADR で不採用とした案を、新 ADR なしに採用する

## 11. 文書索引

| 種別 | 場所 | 内容 |
|---|---|---|
| プロジェクト概要 | [`README.md`](./README.md) | リポジトリ訪問者向けの紹介・クイックスタート |
| Skill | [`.claude/skills/argos/SKILL.md`](./.claude/skills/argos/SKILL.md) | Notion → JSON 生成スキル |
| Plugin manifest | [`.claude-plugin/plugin.json`](./.claude-plugin/plugin.json) | Claude Code plugin として配布する際のメタデータ |
| Marketplace manifest | [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) | 自身を plugin として list する marketplace 定義 |

ADR (`docs/adr/`) / プラン (`docs/plan/`) は発生時に追加する（現状は新規プロジェクトとして空）。

## 12. 質問・不明点の解消

1. 本ファイルで全体感を掴む
2. コード内コメントに WHY が残ることが多い
3. それでも不明なら ADR を起こすところから合意形成する
