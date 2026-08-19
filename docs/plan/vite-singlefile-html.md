# Plan: Vite + 単一 HTML への移行

対応する ADR: [`docs/adr/0001-vite-singlefile-html.md`](../adr/0001-vite-singlefile-html.md)

## 背景

ビルド成果物を `dist/index.html` 1 枚にする。ローカルで `file://` から開け、そのまま配布でき、GitHub Pages のホスト版もその 1 枚を配信する。詳細な判断根拠は ADR 参照。

## 概要

`src/` は Next 非依存（Next からの import は `app/layout.tsx` の型 import 1 行のみ）なので無改変で通す。置き換えるのはエントリポイントとビルド設定、およびそれに引きずられるテスト基盤・CI・ドキュメント。

当初 **vitest の更新が必須**（`@vitejs/plugin-react` 6.x が peer `vite: ^8.0.0` を要求する一方、vitest 2.1.8 は vite 5 系を内包）と見ていたが、**Step 1 の実測でこれは不要と判明**した。vitest 2.x は自前の vite を使い、`vitest.config.ts` は `vite.config.ts` と独立しているため、vite 8 を devDependencies に追加しても既存 163 テストは全緑のままだった。この前提が外れたことで、当初の最大リスクは消えている。

## 進捗

**全 Step 完了**（GitHub Pages への実地 deploy 確認のみ持ち越し）。

- ✅ **Step 1**: Vite 骨格導入（Next と併存）
- ✅ **Step 2**: 単一 HTML 545KB を `file://` で実証
- ✅ **Step 3**: テスト基盤の確認（前提が消えたため縮小）
- ✅ **Step 4**: E2E を Vite dev サーバーへ追従
- ✅ **Step 5**: Next 撤去
- ✅ **Step 6**: CI とドキュメント更新（Pages 配信の実地確認は初回 deploy 時）

## Step 分割

各 step は独立してレビュー可能な単位。step ごとにコミットを分ける。

### ✅ Step 1: Vite 骨格の導入（Next と併存）

Next を消さずに Vite を足し、dev 起動まで確認する。ここで詰まったら引き返せる状態を保つ。

- `vite` / `@vitejs/plugin-react` / `vite-plugin-singlefile` を devDependencies に追加
- リポジトリルートに `index.html` を新設（`app/layout.tsx` の `metadata` を `<title>` / `<meta name="description">` に転記、`<html lang="ja">`）
- `src/main.tsx` を新設（`app/page.tsx` の中身を移植：`ReactFlowProvider` + `App`、`globals.css` の import、dev 時の `window.__argos` 露出を `import.meta.env.DEV` 判定に変更）
- `vite.config.ts` を新設（`plugin-react` + `singlefile`）
- `app/globals.css` の置き場所を決める → **`src/globals.css` に移すが、移動は Step 5（Next 撤去）と同時**。併存期間中は `app/layout.tsx` の import を壊せないため、`src/main.tsx` から `../app/globals.css` を参照する

**確認**: ✅ Vite dev サーバー（`npx vite`）で描画・`window.__argos` 露出・`addIssue` によるノード追加が動作、エラー 0 件

**実施内容**: `index.html` / `src/main.tsx` / `vite.config.ts` / `src/vite-env.d.ts` を新設。`package.json` に併存用の `dev:vite` / `build:vite` / `preview:vite` を追加（既存の `dev` / `build` は Next のまま）。Next build も引き続き成功することを確認済み。

### ✅ Step 2: 単一 HTML ビルドの実証

ADR の「検証すべき前提」1・2 をここで潰す。**この step が通らなければ ADR は Accepted にせず、方針を再検討する。**

- `vite build` で `dist/` に出力
- `dist/` が `index.html` 1 枚だけであることを確認（他ファイルが残る場合は `singlefile` の設定を詰める）
- 出力された HTML を `file://` で開き、描画・Import（ファイルピッカー）・Export（JSON / PNG ダウンロード）が動くことを確認
- HTML の実サイズを記録し、ADR の見積もり（1MB 前後）と突き合わせる

**確認**: ✅ `dist/index.html` 1 ファイルのみ（544,806 bytes / gzip 163KB）。headless Chromium で `file://` から開き、描画・Import（6 ノード / 6 エッジ + シグナル検出）・Export JSON（3,264 bytes）・Export PNG（204,447 bytes）が全て動作、`pageerror` / `console.error` ともに 0 件。実サイズは見積もり 1MB を大きく下回った。

### ✅ Step 3: テスト基盤の確認（内容を縮小）

vitest 更新が不要と判明したため、当初の「メジャー 2 段上げ + 全テスト緑化」から**確認作業のみ**に縮小する。

- vite 8 追加後も `npm test` が緑であることを確認（Step 1 時点で確認済: 18 ファイル 163 テスト全緑）
- Step 5 で Next を撤去した後に、再度 `npm test` / `npm run test:coverage` が緑であることを確認
- coverage の `include: ["src/**/*.{ts,tsx}"]` に `src/main.tsx` / `src/vite-env.d.ts` が入るため、除外設定が必要か判断する

**確認**: ✅ `npm test` 18 ファイル 163 テスト全緑。coverage には `src/**/*.d.ts` の除外を追加した（`src/vite-env.d.ts` が型宣言のみで計上されるため）。`src/main.tsx` はエントリだが `src/App.tsx` 同様 UI 未カバーの扱いで残す

### ✅ Step 4: E2E の追従

- `playwright.config.ts` の `webServer.command` を Vite dev に、`baseURL` / `url` を Vite の port に変更
- `e2e/global.d.ts` の `window.__argos` 型定義が Step 1 の変更と整合しているか確認
- 7 spec を緑にする

**確認**: ✅ 7 spec / 25 テストが `localhost:5173` 上で全緑。`window.__argos` の露出条件を `process.env.NODE_ENV` から `import.meta.env.DEV` に変えたが、`e2e/global.d.ts` の型定義は変更不要だった。port 固定のため `vite.config.ts` に `server: { port: 5173, strictPort: true }` を追加

### ✅ Step 5: Next の撤去

ここまで全て緑になってから消す。

- `next` / `next` 関連 devDependencies を削除
- `app/layout.tsx` / `app/page.tsx` / `next.config.ts` / `next-env.d.ts` を削除
- `package.json` の scripts を Vite に（`dev` / `build` / `start` → `preview`）
- `tsconfig.json` から next plugin と `.next/types` 参照を除去
- `knip.json` の entry から `app/**` を外し `src/main.tsx` を追加
- `biome.json` の ignore から `.next` / `next-env.d.ts` / `out` を整理し `dist` を残す
- `.gitignore` の `out` / `.next` を整理

**確認**: ✅ tsc / biome / vitest 163 / knip / playwright 25 が全て緑。`pnpm build:skill` も成功し生成物に差分なし。`package.json` に `"type": "module"` を入れたことで `vite.config.ts` の CommonJS 警告も解消

**作業中に踏んだ落とし穴 2 件**:

1. **`.gitignore` の `out` は消してはいけなかった**。Next のビルド出力と同名だが、skill が `out/raw-<page_id>.txt` 等の**中間ファイル置き場**として使っている（`.claude/skills/argos/SKILL.md` Step 2）。Next 用として消した結果、skill の作業ファイルが追跡対象になる回帰が生じたため、用途を明記したうえで `/out/` として復活させた
2. **`biome.json` の ignore から `.next` を外すと残骸を検査してしまう**。ローカルに残っていた `.next/` 31MB を biome が読み込み 1,513 errors になった。`.next/` と `out/` の実ディレクトリを削除して解消

### ✅ Step 6: CI とドキュメント

- `.github/workflows/deploy.yml`
  - `NEXT_PUBLIC_BASE_PATH` env を削除
  - `touch out/.nojekyll` を削除（`_next/` が消えるため不要）
  - `upload-pages-artifact` の path を `./out` → `./dist`
- `README.md`: ビルド・デプロイ節を書き換え、単一 HTML をローカルで開く手順を追記
- `CLAUDE.md`: §3 のディレクトリ構成、§6 の共通コマンドと「非ルートパス配信」節（削除）、§11 の索引を更新
- `.claude/skills/argos/SKILL.md`: 生成 JSON の受け渡し手順に変更があれば追従
- ADR の Status を `Proposed` → `Accepted` に更新し、Step 2 で実測したサイズを反映

**確認**: ⬜ **持ち越し** — main に push して GitHub Pages のホスト版が従来通り動くこと（ADR 検証項目 5）は、実際に deploy するまで検証できない。それ以外のドキュメント・CI 更新は完了

**CLAUDE.md の追加更新**: §9-3 は「Hydration mismatch」から「永続値の読み出しタイミング」に改題した。SSR が無くなり mismatch 自体は起きなくなったが、mount 後 useEffect の形は維持しており、代わりに初回 load 時のテーマフラッシュがトレードオフとして残る（この情報は削除した `app/layout.tsx` のコメントにあったもの）

## 受け入れ条件

- ✅ `pnpm build` の成果物が `dist/index.html` 1 ファイルのみ（544,806 bytes）
- ✅ その HTML を `file://` で開いて、グラフ描画・JSON Import・JSON/PNG Export が動く
- ✅ `npx tsc --noEmit` / `npx biome check .` / `npm test` / `npx playwright test` / `npm run check:dead` が全て緑
- ⬜ GitHub Pages のホスト版が移行前と同じ挙動 — **初回 deploy まで確認不能**
- ✅ リポジトリに Next への参照が残っていない（実装・設定から除去済。ADR / 本プラン / CLAUDE.md §9-3 に経緯として残る記述と、`tests/fixtures/extraction/deploy-target.fixture.ts` の議事録サンプル文中の "Next.js" は対象外）

## スコープ外

- `src/` 配下のアプリロジックの変更（移行に伴う mount 周辺を除く）
- skill 側（`.claude/skills/argos/`）の出力仕様の変更。単一 HTML にデータを埋め込んで配布する案は、この移行が完了してから別プランで検討する
- バンドルサイズの削減（React Flow の置き換え等）

## 未確定事項

### 解決済み

- ~~`singlefile` が 1 枚に収束しない場合の扱い~~ → デフォルト設定のまま `dist/index.html` 1 枚に収束した
- ~~vite 8 の rolldown 移行に伴う追加依存~~ → `@vitejs/plugin-react` 6.x の peer `@rolldown/plugin-babel` / `babel-plugin-react-compiler` はいずれも `optional: true`。追加不要で install も peer 警告なし
- ~~`app/globals.css` の移動先~~ → `src/globals.css` に移す。ただし移動は Step 5 と同時。CLAUDE.md §8 のスタイリング規約も Step 6 で追従する

- ~~`vite.config.ts` が CommonJS として読まれる警告~~ → Step 5 で `package.json` に `"type": "module"` を追加して解消。dev / build のどちらでも警告は出なくなった

### 未解決

- **GitHub Pages の実地確認**。`deploy.yml` は `path: ./dist` に切り替え、`NEXT_PUBLIC_BASE_PATH` と `touch out/.nojekyll` を削除済み。単一 HTML なので underscore 始まりのディレクトリを出力せず `.nojekyll` は不要という判断だが、実際に main へ push するまで検証できない。初回 deploy でホスト版を目視確認し、問題があれば ADR に結果を追記する
