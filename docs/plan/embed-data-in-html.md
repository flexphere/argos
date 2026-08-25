# Plan: 議論データを埋め込んだ HTML の生成

対応する ADR: [`docs/adr/0003-embed-data-in-html.md`](../adr/0003-embed-data-in-html.md)

## 背景

skill が `extractions/<page-id>.html` を生成し、渡した相手が Import 操作なしに議論グラフを開けるようにする。併せて、受け取った側が編集して再び HTML として渡せるよう Export も追加する。判断根拠は ADR 参照。

## 概要

ブラウザ側とスクリプト側が合意する規約は 1 つだけ。

```html
<script type="application/json" id="argos-embedded-data">{ ...fixture... }</script>
```

要素 ID の定数は `src/schema/embedded.ts` に置き、store / io / skill スクリプトの三者が参照する。`schema` はどの層からも参照でき、`tests/architecture/dependencies.test.ts` の依存方向を壊さない。

書き出す側は `<` を `<` にエスケープし、読む側は `JSON.parse` してから既存の取り込み経路（`applyExtraction` + `applyStoredSemantic`）に流す。

埋め込みがあるときは **graph store の localStorage 永続化を無効にする**。`file://` では全ファイルが同じ localStorage を共有するため、会議ごとの HTML が互いの状態を奪い合うことを実測で確認したため（ADR 参照）。

## 進捗

**全 Step 完了。**

- ✅ Step 1: 規約の定数と埋め込みデータの読み込み、persist の無効化
- ✅ Step 2: 埋め込みスクリプト (`embed-fixture.ts`)
- ✅ Step 3: テスト (unit 12 件 + e2e 5 件を追加)
- ✅ Step 4: HTML の Export と往復
- ✅ Step 5: skill への統合
- ✅ Step 6: CI のパス追加と version bump (0.2.0 → 0.3.0)

### 実装で分かったこと

**1. `vite-plugin-singlefile` はアプリの script を head の先頭付近に置く。** `</head>` 直前の埋め込みは script より後になる。それでも読めるのは inline の `<script type="module">` が defer 相当で HTML パース完了後に評価されるため。位置は本質的な条件ではなかった (ADR の記述を修正済み)。

**2. `pnpm build:skill` は HTML を再生成しない。** 実装中、埋め込んでもノードが 0 件になる事象を追ったところ、原因はテンプレート (`assets/argos.html`) が古いままだったこと。PR #2 で入れた CI の鮮度チェックが守る対象そのものを踏んだ形で、CI があれば PR で止まっていた。CLAUDE.md §10 に注意書きを追加した。

**3. `createJSONStorage(() => localStorage)` は store 生成時に一度だけ評価される。** Step 4 で `htmlExport` がモジュールグラフに加わった結果、評価順序が変わって unit テスト 83 件が `Cannot read properties of undefined (reading 'setItem')` で落ちた。`globalThis.localStorage` を毎回引く `StateStorage` に置き換えて解消。Step 1 の実装は運良く動いていただけだった。

## Step 分割

step ごとにコミットを分ける。

### Step 1: 規約の定数と、埋め込みデータの読み込み

- `src/schema/embedded.ts`: `EMBEDDED_DATA_ELEMENT_ID` を定義
- `src/io/jsonIO.ts`: `parseImportFile(file)` から `parseImportJson(text)` を切り出す。`parseImportFile` は `await file.text()` してから前者を呼ぶ薄いラッパーにする（`ImportMenu` は無改変）
- `src/io/embeddedFixture.ts` を新設。要素があれば `ImportResult` を返し、無ければ `null`
- `src/store/graphStore.ts`: 埋め込み要素がある場合、`persist` の storage を no-op に差し替える。store が DOM を読むことになるため、理由をコメントで残す
- `src/main.tsx`: 起動時に読み出して取り込む。`ImportMenu` と同じ分岐

取り込みに失敗しても**アプリは起動させる**。壊れたデータで白画面になるより、空グラフで開いて Import を促せる状態のほうがよい。失敗は `console.error` に留める。

**確認**: 埋め込みなしで従来どおり空グラフ起動かつ persist が効く。埋め込みありでグラフが復元され、かつ localStorage に書かれない

### Step 2: 埋め込みスクリプト

- `scripts/embed-fixture.ts` を新設
  - 引数: `--fixture <path> --template <path> --out <path>`
  - fixture を zod 検証してから埋め込む（壊れたデータを焼き込まない）
  - `<` / U+2028 / U+2029 をエスケープ
  - **`</head>` の直前**に script 要素を挿入する。アプリ本体の script より前にパースされることを保証するため
- `scripts/build-skill.mjs`: bundle 対象を 2 本にする

**確認**: `</script>` を含む fixture でも壊れない HTML が出る

### Step 3: テスト

- `tests/embedFixture.test.ts`: エスケープの単体テスト。**`</script>` と `<!--` と U+2028 を含む fixture** を通し、生成された HTML から `JSON.parse` で元のデータが復元できることを確認
- `tests/jsonIO.test.ts`: `parseImportJson` の切り出しで既存挙動が変わっていないことを確認
- `e2e/embedded.spec.ts`: 埋め込み済み HTML を開いてノードが描画されること、localStorage に書かれないことを確認

**確認**: `npm test` / `npx playwright test` が緑

### Step 4: HTML の Export

- `src/io/htmlExport.ts` を新設。現在のグラフを Export 形式に変換し、**現在のページ自身の HTML** を土台にデータを差し替えてダウンロードさせる
  - 土台の取得は `document.documentElement.outerHTML`。既存の埋め込み要素があれば置換し、無ければ挿入する
  - エスケープは Step 2 と同じ規則を共有する（`src/io/` 側に置いて skill スクリプトから import するか、規約を 1 箇所にまとめるかは実装時に決める）
- `src/ui/ExportMenu.tsx`: 「HTML（データ込み）」の項目を追加

**確認**: Export した HTML を開くと同じグラフが表示される（往復が成立する）

### Step 5: skill への統合

- `SKILL.md`: Step 8 の後に HTML 生成ステップを追加。報告テンプレートにも `.html` のパスを載せる
- テンプレートの所在は `${CLAUDE_PLUGIN_ROOT}/.claude/skills/argos/assets/argos.html`
- `README.md` / `CLAUDE.md` を追従

**確認**: 手順どおりに実行して `extractions/<id>.html` が生成でき、開いて議論グラフが見える

### Step 6: CI とリリース

- **`ci.yml` の鮮度チェックのパス一覧に `embed-fixture.mjs` を追加する。** bundle 対象が 2 本になるため。忘れると ADR 0002 で塞いだ穴が再発する
- `plugin.json` の `version` を上げる。skill の出力仕様が変わる（成果物が 1 つ増える）ので **minor**
- ADR 0003 の Status を `Accepted` に

**確認**: CI が緑、`claude plugin validate ./` が通る

## 受け入れ条件

- `extractions/<page-id>.html` を開くだけで議論グラフが表示される（Import 操作不要）
- `extractions/<page-id>.json` も従来どおり出力される
- 埋め込み HTML は localStorage に書き込まない。複数の会議 HTML を `file://` で開いても互いに干渉しない
- 埋め込みが無い通常のビルドでは、これまでどおり persist が効く
- `</script>` を含むデータでも HTML が壊れない（テストで担保）
- 埋め込みが壊れている場合でもアプリは起動する
- ブラウザから Export した HTML を開くと同じグラフが復元される
- `npx tsc --noEmit` / `npx biome check .` / `npm test` / `npx playwright test` / `npm run check:dead` が緑
- CI の鮮度チェックが `embed-fixture.mjs` も対象にしている

## スコープ外

- 埋め込み HTML のサイズ最適化

## 未確定事項

### 解決済み

- ~~`main.tsx` で取り込むタイミング~~ → `createRoot().render()` の**前**に store を更新する形で問題なかった。`computeLayout` は DOM 非依存の純粋関数
- ~~Export した HTML の土台の取り方~~ → 複製時に `#root` の中身を空にしてから `outerHTML` を取る。往復テスト (`e2e/embedded.spec.ts`) で復元を確認済み
- ~~エスケープ規則の共有方法~~ → `src/schema/embedded.ts` に定数と関数を置き、store / io / skill スクリプトの三者が参照する形にした。schema はどの層からも import でき、architecture テストの依存方向も壊さない

- ~~dev サーバーでは HTML Export が機能しない~~ → **UI 上で選べないようにした**。

  実測すると出力は 39.6KB（本番ビルドは約 545KB）で、`/@vite/client` と `/src/main.tsx` を外部参照したままになる。`file://` で開くと CORS で全て弾かれ、**完全な白画面**になる（ヘッダーすら出ない）。データ自体は埋め込まれているが、それを読むアプリが入っていない。

  踏むのは `pnpm dev` で動作確認している開発者だけで、利用者が触る HTML（skill 生成物 / plugin 同梱 / ホスト版）はすべて本番ビルド由来なので影響しない。ただし失敗が `console.warn` にしか出ず、押した本人は成功したように見えるため、`import.meta.env.DEV` のとき項目を `disabled` にして理由を表示する形にした。`htmlExport` 側の警告も直接呼び出しへの防御として残してある。

### 未解決

現時点でなし。

