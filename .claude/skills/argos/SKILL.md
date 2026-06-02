---
name: argos
description: Visualize a Notion AI Meeting Notes page as an argos argument graph. Use this when the user wants to extract Issues/Claims/Arguments from a Notion meeting page and view it as a graph, typing patterns like "/argos <URL>" or "visualize this notion meeting" with a notion.so URL.
---

# argos: Notion AI Meeting Notes → 議論グラフ

## このスキルの役割

ユーザーが指定した Notion ページからトランスクリプトを取得し、**親 Claude Code セッション (= あなた) が直接 in-context で抽出と意味分析を行う**。結果 JSON を argos の静的アセット (`extractions/<page-id>.json`) に書き出し、ユーザーはブラウザの **Import → JSON ファイルから** で読み込む。

**責務分割**:
- **Claude Code (skill, このセッション)**: Notion 取得 (MCP) → transcript 抽出 → **in-context で ExtractionResult / SemanticAnalysisResult を生成** → 保存スクリプトで zod 検証 + 書き出し
- **Browser (argos)**: ユーザー操作で JSON を読み込みグラフ描画 (LLM 依存なし・静的配信可)

LLM 推論はすべて親セッション内で完結するので、`claude -p` などのサブプロセス起動は不要。

**最終出力**: `extractions/<page-id>.json` のパスとブラウザでの読み込み手順

## 前提条件

- `claude.ai` の Notion インテグレーションが対象ワークスペースで Approved されている (`mcp__claude_ai_Notion__notion-fetch` が動く)
- Node.js 22+ が PATH に存在する (scripts は self-contained ESM バンドルのため追加依存インストールは不要)
- argos ブラウザアプリが開いていること (static export を任意の方法で配信、または開発時は `pnpm dev`)

## 実行ステップ

### Step 1: URL から page_id を抽出

```bash
node "${CLAUDE_PLUGIN_ROOT}/.claude/skills/argos/scripts/url-parser.mjs" "<URL>"
```

stdout に 32 文字 hex の `page_id` が出る。

### Step 2: 出力ディレクトリ準備

```bash
mkdir -p out extractions
```

`out/` は中間ファイル (raw / transcript / 生成 JSON)、`extractions/` はブラウザに配信する最終 JSON。

### Step 3: Notion ページの raw を取得

`mcp__claude_ai_Notion__notion-fetch` を以下で呼ぶ:

```json
{ "id": "<URL or page_id>", "include_transcript": true }
```

レスポンスは markdown 風テキストで `<meeting-notes>` `<transcript>` 等のタグを含む。

**保存ルール (重要)**: レスポンスを `out/raw-<page_id>.txt` に **そのまま (verbatim) 保存** する。`<meeting-notes>` `<transcript>` 等のラッパータグも消さない。Step 4 のスクリプトがこれらのタグを目印に transcript を抽出するため。

- レスポンスが大きく (>70K 字程度) tool-results ファイルに自動退避された場合: その path をそのまま Step 4 の `--input` に渡す (再書き出し不要)
- インラインで返ってきた場合: そのまま Write ツールで `out/raw-<page_id>.txt` に保存

### Step 4: Transcript を取り出す

```bash
node "${CLAUDE_PLUGIN_ROOT}/.claude/skills/argos/scripts/extract-transcript.mjs" \
  --input <MCPレスポンスファイル または raw-<page_id>.txt> \
  --output out/transcript-<page_id>.txt
```

`<transcript>` セクションを整形抽出する。スクリプトは以下を順に試すフォールバック付き:
1. `<meeting-notes><transcript>...</transcript></meeting-notes>` (= MCP raw)
2. `<transcript>...</transcript>` 単独
3. タグ無しテキスト → そのまま transcript として透過

ただし **(1) が前提**。タグを残した raw を渡すのが最も確実。

### Step 5: ユーザーに意味分析の要否を確認

抽出のたびに **意味分析も同時実行するか**ユーザーに聞く。

- **Yes**: 抽出後に意味分析を 1 回実行。論点ズレ・接続先見直し候補がグラフに焼き込まれる。
- **No**: 抽出のみ。あとから生成し直したい場合は再度スキルを呼ぶ。

ユーザー回答に応じて Step 7 (意味分析) をスキップするか決める。

### Step 6: in-context 抽出 → out/extraction-<page_id>.raw.json

1. リファレンスを読む:
   ```
   Read: ${CLAUDE_PLUGIN_ROOT}/.claude/skills/argos/references/EXTRACTION_PROMPT.md
   ```
2. transcript を読む:
   ```
   Read: out/transcript-<page_id>.txt
   ```
3. EXTRACTION_PROMPT.md の指示と JSON スキーマに従って **ExtractionResult JSON を組み立て**、`Write` ツールで以下に保存:
   ```
   out/extraction-<page_id>.raw.json
   ```

このステップで LLM 推論を行うのは **このセッション (= あなた) 自身**。追加のサブプロセスや API キーは不要。

### Step 7 (任意): in-context 意味分析 → out/semantic-<page_id>.raw.json

Step 5 で **Yes** を選んだ場合のみ実行。

1. リファレンスを読む:
   ```
   Read: ${CLAUDE_PLUGIN_ROOT}/.claude/skills/argos/references/SEMANTIC_PROMPT.md
   ```
2. 直前の抽出結果を読む:
   ```
   Read: out/extraction-<page_id>.raw.json
   ```
3. SEMANTIC_PROMPT.md の指示に従って **SemanticAnalysisResult JSON を組み立て**、`Write` ツールで以下に保存:
   ```
   out/semantic-<page_id>.raw.json
   ```

### Step 8: zod 検証 + 保存

```bash
node "${CLAUDE_PLUGIN_ROOT}/.claude/skills/argos/scripts/save-fixture.mjs" \
  --extraction-file out/extraction-<page_id>.raw.json \
  --page-id <page_id> \
  [--semantic-file out/semantic-<page_id>.raw.json]
```

- 入力 JSON を zod スキーマで検証
- 通れば `{...extraction, semantic?}` を `extractions/<page_id>.json` に保存
- 検証エラー時は stderr に項目別エラーを出力 (例: `claims.2.addresses: Expected string, received null`)

stdout 最終行: `OK page_id=<id> issues=<n> claims=<m> arguments=<k> semantic=<yes|no>`

**検証失敗時**: stderr のエラーメッセージを読み、Step 6 / 7 で書き出した JSON を修正して再度 save-fixture を実行する (Step 6/7 から完全に作り直す必要はない)。

### Step 9: ユーザーへの読み込み手順を案内

ユーザーは開いている argos のブラウザで:

1. ヘッダーの **Import** ドロップダウンを開く
2. **JSON ファイルから** を選択
3. ファイル選択ダイアログで `extractions/<page_id>.json` を選ぶ
4. 「インポート」を押して確認

`parseImportFile` が形式 (export / fixture) を判定し、fixture なら `applyExtraction` + (semantic があれば) `applyStoredSemantic` で ref→UUID 再マップして描画する。

### Step 10: ユーザーへの報告

```
📊 argos JSON 生成完了

Notion ページ: <ページタイトル>
Page ID: <page_id>
抽出結果:
  - Issues: <n>
  - Claims: <m>
  - Arguments: <k>
意味分析: <yes / skipped>
  (yes の場合) drift=<a> misplaced=<b>

出力ファイル:
  - out/transcript-<page_id>.txt
  - extractions/<page_id>.json

ブラウザの Import → 「JSON ファイルから」で上記 JSON を読み込んでください。
```

## エラーハンドリング

| エラー | 対処 |
|---|---|
| URL パース失敗 | 「Notion URL の形式が認識できません」を表示、終了 |
| MCP fetch 404 / object_not_found | 「この連携にページへのアクセス権がありません。ページの Connections に Claude 連携を追加してください」 |
| `meeting-notes` 無し | 「録音された meeting_notes ブロックがありません」 |
| `save-fixture.mjs` の zod エラー | stderr の項目別エラーを読み、Step 6 / 7 の生成 JSON を修正して再 save |
| Import 後に「インポート失敗」の zod エラー | JSON のフォーマットがどちらでもないことを示す。`save-fixture.mjs` を経由した最終 JSON を渡しているか確認 |

## 補足: スキルの拡張ポイント (未実装)

- **手動メモから References / 決定事項を狙い撃ち抽出** (blanket 取り込みではなく、構造を保ったまま高シグナルだけ追加)
- **複数 fixture のマージ** (現状 `applyExtraction` が append 動作)
