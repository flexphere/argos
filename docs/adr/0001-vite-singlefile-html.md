# ADR 0001: Next.js static export から Vite + 単一 HTML へ移行する

- Status: Accepted
- Date: 2026-08-19

## 背景

argos の成果物を **単一 HTML ファイル 1 枚**にしたい。ローカルにダウンロードしてダブルクリックで開ける、そのまま人に渡せる、という配布形態を唯一の成果物とする。

現状の `output: "export"` はこの要件を満たさない。実測すると:

- `out/` は `index.html` + `_next/` 配下 12 ファイル、合計約 992KB（最大チャンク 324KB）
- `index.html` の参照は全て root-absolute（`/_next/static/chunks/*.js` が 6 本、`*.css` が 2 本）
- したがって `out/index.html` を `file://` で開いても `file:///_next/...` を解決できず表示できない

一方で、載せ替えコストは低いことが分かっている。`src/` `app/` `scripts/` `e2e/` 全体で Next からの import は **1 箇所のみ**:

```
app/layout.tsx:1:import type { Metadata } from "next"
```

しかも `import type` なので実行時には消える。アプリ本体である `src/`（約 5,400 行）は Next に一切依存しておらず、`next/image` `next/font` `next/navigation` いずれも未使用。Next が担っているのは実質 `app/` の 3 ファイル（HTML の殻と mount 処理）だけである。

## 採用案

**Vite + `@vitejs/plugin-react` + `vite-plugin-singlefile`** に載せ替え、`dist/index.html` 1 枚を唯一のビルド成果物とする。GitHub Pages のホスト版もこの 1 枚を配信する。

- `app/layout.tsx` → `index.html`（`<title>` / `<meta>` を直書き）
- `app/page.tsx` → `src/main.tsx`（`ReactFlowProvider` + `App` の mount）
- `next.config.ts` → `vite.config.ts`
- `src/` は無改変

採用理由:

- `src/` が Next 非依存なので、載せ替えの影響範囲がエントリポイント周辺に限定される
- `vite-plugin-singlefile` は JS/CSS のインライン化を正規の手段として提供しており、後処理ハックにならない
- vitest はもともと Vite ベースなので、テスト基盤との親和性が上がる

## 不採用案

### 1. Next を残し、ビルド後にチャンクを HTML へインライン化する後処理を足す

Next のチャンクローダとランタイムは複数ファイル前提で動く。それを外から書き換える後処理は、Next のマイナー更新のたびに壊れるリスクを恒常的に抱える。単一 HTML が唯一の成果物である以上、Next の多ページ・多チャンク前提を維持する理由がない。

### 2. `assetPrefix: "./"` で相対参照にし、`out/` フォルダごと配布する

`file://` で開けるようにはなるが、成果物は 13 ファイルのフォルダのまま。「唯一の成果物 = 単一 HTML」という要件を満たさない。単に「ローカルで開ければよい」なら最短手だが、今回の要件では不足。

### 3. 現状維持（skill が JSON を出力し、ホスト版ブラウザで読む）

配布のたびに「ホスト版を開いて Import する」手順が必要で、成果物単体で完結しない。要件を満たさない。

## 結果・影響

**簡素化されるもの**

- `NEXT_PUBLIC_BASE_PATH` の仕組みが丸ごと不要になる。単一 HTML では外部アセット参照自体が発生しないため、サブパス配信のための basePath / assetPrefix 調整が消える。`next.config.ts` のコメントと CLAUDE.md §6「非ルートパス配信」の節も削除対象
- `deploy.yml` の `touch out/.nojekyll` が不要になる（`_next/` が消えるため Jekyll に弾かれる対象がない）

**新たに必要になるもの**

- ~~**vitest の更新**が必須~~ → **実測により不要と判明**。vitest 2.x は自前の vite を内包しており、devDependencies に vite 8 が入っても自身の vite を使う。`vitest.config.ts` は `vite.config.ts` と独立しているため設定の共有も発生しない。実際に vite 8.2.1 / `@vitejs/plugin-react` 6.0.5 / `vite-plugin-singlefile` 2.3.3 を追加した後も、既存 unit 18 ファイル 163 テストは全緑のまま（peer 警告も出ない）。vitest の更新は移行の必須要件から外し、将来 `vite.config.ts` の plugin をテスト側でも共有したくなった時点で改めて検討する
- `playwright.config.ts` の `webServer.command` と port（Next 3000 → Vite 5173）
- `tsconfig.json` から next plugin と `.next/types` 参照を除去、`next-env.d.ts` 削除
- `app/page.tsx` の `process.env.NODE_ENV` → `import.meta.env.DEV`
- `knip.json` の entry から `app/**` を外し `src/main.tsx` を追加、`biome.json` の ignore から Next 系を整理

**サイズ**

当初は現行チャンク（JS 約 928KB + CSS 約 30KB）からの逆算で 1MB 前後と見積もっていたが、**実測は 544,806 bytes（約 545KB、gzip 163KB）**。Next のランタイムとチャンクローダが落ちる分、見積もりを大きく下回った。React Flow がサイズの大半を占めるためこれ以上の削減余地は小さいが、ローカル配布・Pages 配信のいずれでも十分許容範囲。

## 検証すべき前提

Proposed から Accepted に進めるには、以下を実測で確認する。

1. ✅ **確認済** — `vite-plugin-singlefile` 2.3.3 で `dist/` に `index.html` 1 ファイルのみ出力される（545KB）。ビルドログ上も `index-*.js` / `style-*.css` の 2 アセットが Inlining され、HTML 内の外部参照はゼロ（inline `<script>` 2 + inline `<style>` 1 で完結）
2. ✅ **確認済** — headless Chromium で `file://` 経由の HTML を開き、以下を実測。`pageerror` / `console.error` ともに 0 件
   - グラフ描画: React Flow・サイドパネル・ミニマップ・コントロールすべて表示
   - Import: fixture JSON をファイルピッカーから読み込み、6 ノード / 6 エッジを描画。シグナル検出（未応答の反論・採用検討の余地あり）も機能
   - Export JSON: `argos-20260819-1434.json` を 3,264 bytes でダウンロード
   - Export PNG: `argos-20260819-1434.png` を 204,447 bytes でダウンロード
3. ~~vitest 4 で既存 unit テストが緑になること~~ → vitest 更新自体が不要になったため項目を取り下げ。vite 8 追加後も既存 18 ファイル 163 テストは全緑
4. ✅ **確認済** — Playwright 7 spec / 25 テストが Vite dev サーバー（`localhost:5173`）上で全て緑
5. ✅ **確認済** — PR #1 のマージで Pages deploy が走り、https://flexphere.github.io/argos/ が正常に動作することを確認した。headless Chromium での実測は以下。`.nojekyll` を落とし `basePath` を削除した判断も妥当だったことになる
   - HTTP 200、転送サイズ 162,275 bytes（gzip）
   - **ネットワークリクエストは 1 本のみ**（`index.html` だけ）。外部アセットを一切取りに行かずページが完成している
   - `_next/` への参照 0 件、`pageerror` / `console.error` ともに 0 件

全項目の検証が完了した。

実装プランは [`docs/plan/vite-singlefile-html.md`](../plan/vite-singlefile-html.md)。
