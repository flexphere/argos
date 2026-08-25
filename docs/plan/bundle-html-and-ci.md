# Plan: HTML の plugin 同梱と CI 整備

対応する ADR: [`docs/adr/0002-bundle-html-in-plugin.md`](../adr/0002-bundle-html-in-plugin.md)

## 背景

ビルド済み単一 HTML を plugin に同梱し、生成物の鮮度を CI で保証する。判断根拠は ADR 参照。

CI は現在 `deploy.yml` 1 本のみで、**テストすら回っていない**。`.husky/pre-commit` は「テスト実行はここに含めない (時間がかかり過ぎるため CI 側で対応)」とコメントしているが、その CI 側が存在しない状態。今回まとめて塞ぐ。

## 概要

同梱する生成物は 2 つ。どちらも `src/` から生成され、どちらも git track する。

| 生成物 | 生成元 | コマンド |
|---|---|---|
| `.claude/skills/argos/assets/argos.html` | `src/**` 全体 | `pnpm build` |
| `.claude/skills/argos/scripts/save-fixture.mjs` | `scripts/save-fixture.ts` + `src/schema/*` | `pnpm build:skill` |

後者は既に track されているが鮮度を保証する仕組みがなく、実際に一度ズレかけている（ADR 参照）。今回のガードは両方を同じ仕組みで守る。

## 進捗

**全 Step 完了。**

- ✅ **Step 1**: 品質センサー CI 新設（PR #1 でマージ済み）。Ubuntu ビルドのハッシュが手元と完全一致し、ADR 0002 の前提が実証された
- ✅ **Step 2**: HTML を `.claude/skills/argos/assets/argos.html` に同梱
- ✅ **Step 3**: 生成物の鮮度チェック
- ✅ **Step 4**: version bump チェック
- ✅ **Step 5**: plugin としての動作確認とドキュメント

## Step 分割

step ごとにコミットを分ける。

### Step 1: 品質センサー CI の新設

他の step と独立していて、単体で価値が出るので先に入れる。

- `.github/workflows/ci.yml` を新設。PR と main push で起動
- `npx tsc --noEmit` / `npx biome check .` / `npm test` / `npm run check:dead` を実行
- `npx playwright test` を実行（ブラウザのインストール step が要る。キャッシュを検討）
- `HUSKY: "0"` は `deploy.yml` と同様に設定
- **併せて `pnpm build` して `dist/index.html` の SHA-256 を出力するだけの step を置く**。ADR 0002 の前提（ビルドが決定的）が Ubuntu でも成り立つかを、生成物をコミットする前に確認するため。手元の実測値 `41dbfcfb…ecabc1d0` と突き合わせる

**確認**: ✅ PR #1 で全 job 緑。Ubuntu / Node 22 のビルドハッシュは `41dbfcfb0d9218874f2d2549b221b94e5a49d21f1620c9829b7d3900ecabc1d0` で、手元（macOS / Node 24・22）と**完全一致**した。バイト一致による鮮度検証が成立することを確認

マージ後に Pages deploy も走り、ADR 0001 の最後の持ち越しだったホスト版の確認も完了した。https://flexphere.github.io/argos/ はネットワークリクエスト 1 本（`index.html` のみ）・`_next/` 参照 0・エラー 0 で動作している。

### Step 2: HTML を plugin に同梱

- `pnpm build` の出力を `.claude/skills/argos/assets/argos.html` にも配置する
  - `build` script を `vite build && <copy>` にするのが素直。`dist/` は Pages deploy がそのまま使うので残す
  - copy 手段は OS 差を避けるため node スクリプトにするか要検討（`cp` は CI の Ubuntu でも動くので単純に済ませてもよい）
- `.gitignore` は `dist` のみ無視のままで、`assets/` は track させる
- **`biome.json` の ignore に `.claude/skills/argos/assets/` を追加する。** これを忘れると biome が 545KB のミニファイ済み 1 行 HTML を検査対象にする。Vite 移行時に `.next/` 31MB を検査して 1,513 errors になった事例と同じ失敗で、生成物をコミットした瞬間に発生するため **Step 2 の中で同時に入れる**（後追いにしない）
- `knip.json` は `project` が `src/` / `tests/` / `e2e/` に限定されているため影響を受けないが、copy 先を変える場合は再確認する
- 生成した HTML を初回コミット
- `.claude/skills/argos/SKILL.md`: テンプレートの所在を追記
- `README.md`: plugin 利用者向けに「インストールすれば HTML が手元に入る」ことを記載

**確認**: ✅ `pnpm build` 後に `git status` がクリーン。`dist/index.html` と `assets/argos.html` の SHA-256 も一致

複製は `cp` ではなく vite の `closeBundle` フック内で node の API を使って行う（OS 差を持ち込まないため）。`apply: "build"` を付けているので dev では走らない。

**biome の ignore について補足**: 当初「ignore しないと 545KB を検査してしまう」と見込んでいたが、実測すると **biome 1.9 は `.html` を処理しない**（ルートの `index.html` も「0 files processed」）。したがって現時点では無害で、追加した ignore は将来 biome が HTML をサポートした場合の予防にあたる。

### Step 3: 生成物の鮮度チェックを CI に追加

ADR の根拠となった「ビルドは決定的」を CI 上で実証する step でもある。

```yaml
- run: pnpm build
- run: pnpm build:skill
- run: git diff --exit-code -- .claude/skills/argos/assets/argos.html .claude/skills/argos/scripts/save-fixture.mjs
```

- 差分検出時のメッセージで対処を案内する（`pnpm build && pnpm build:skill` を実行して commit する、と）
- **この step で Ubuntu ビルドのハッシュが手元と一致するかが判明する**。一致しなければ ADR の前提が崩れるので、その場合は「未確定事項」に従って方針を見直す

**確認**: ✅ ローカルで同じロジックを実行し、正常系（差分なし = 通過）と異常系（生成物を書き換え = 検出して `diff --stat` を出力）の両方を確認済み

### Step 4: version bump チェックを CI に追加

**前提: 今後の変更は PR 経由に移行する。** このチェックは base との diff が必要で、main への直 push では base が取れず黙って通過してしまう。既存 10 コミットは全て main 直 push だが、ここで運用を切り替える。

- PR の base との diff で、`.claude/skills/argos/assets/argos.html` または `save-fixture.mjs` が変わっているかを判定
- 変わっているのに `.claude-plugin/plugin.json` の `version` が据え置きなら失敗させる

`version` を bump しない限り利用者に更新が届かない（[docs](https://code.claude.com/docs/en/plugins)）ため、これが無いと「CI は緑だが誰にも届かない更新」が発生する。

#### version の基準

利用者から見た影響度で分ける。CI のエラーメッセージにもこの基準を書く。

| 変更内容 | 上げる桁 |
|---|---|
| UI の見た目・振る舞いの変更 | **patch** |
| skill の出力仕様 / JSON スキーマの変更 | **minor** |
| 互換を壊す変更（古い JSON が読めなくなる等） | **major** |

**確認**: ✅ ローカルで同じロジックを実行し、正常系（`0.1.0` → `0.2.0` = 通過）と異常系（据え置き = `exit 1`）の両方を確認済み

### Step 5: plugin としての動作確認とドキュメント

- `claude --plugin-dir ./` で実際に読み込み、`/argos` skill が認識されること、同梱 HTML が期待の場所にあることを確認
- `plugin.json` の `version` を 0.1.0 から上げる（同梱物が増えるため）
- ADR 0002 の Status を `Proposed` → `Accepted` に更新し、Step 3 で判明した Ubuntu ビルドの結果を追記

**確認**: ✅ `claude plugin validate ./` が通過。同梱した `assets/argos.html` を `file://` で開き、描画・Import（6 ノード / 6 エッジ）・Export JSON が動作、**ネットワークリクエストは 1 本のみ**（自己完結）、エラー 0 件

`version` は 0.1.0 から **0.2.0** に上げた。配布物の構成が変わる（HTML が加わる）ため minor とした。

#### 事前調査で解消済みの懸念

`claude plugin tag` は「plugin.json と marketplace エントリの version が一致すること」を検証するため、`marketplace.json` にも毎回 version を書く必要があるのではないかと懸念していたが、**不要と確認した**。

```
$ claude plugin validate ./
✔ Validation passed

$ claude plugin tag ./ --dry-run --force
Plugin:  argos
Version: 0.1.0 (from plugin.json)
Marketplace entry: plugins[0] in .claude-plugin/marketplace.json
Tag:     argos--v0.1.0
✔ Dry run — would create tag argos--v0.1.0 at HEAD
```

marketplace エントリに `version` が無い状態でも「不一致」とは扱われず、`plugin.json` から解決される。**リリース時に触るのは `plugin.json` の version だけでよい。**

#### 併せて確認された警告

```
⚠ CLAUDE.md: CLAUDE.md at the plugin root is not loaded as project context.
  To ship context with your plugin, use a skill instead.
```

argos の `CLAUDE.md` は「このリポジトリで作業する AI エージェント向け」であって plugin 利用者に配る意図はないため、この警告は現状の設計に対しては的外れ。対処不要と判断するが、`claude plugin validate` を CI に入れる場合は警告が出続けることを踏まえておく（`--strict` は付けない）。

## 受け入れ条件

- ✅ `pnpm build` 後に作業ツリーがクリーンになる（生成物がコミット済みと一致）
- ✅ 生成物を古いまま push した PR が CI で落ちる（ロジックをローカルで実証）
- ✅ 生成物を変えて version を据え置いた PR が CI で落ちる（同上）
- ✅ `npx tsc --noEmit` / `npx biome check .` / `npm test` / `npx playwright test` / `npm run check:dead` が CI で緑
- ✅ `claude plugin validate ./` が通る
- ✅ plugin をインストールした利用者が、ネットワークなしで argos を開ける（同梱 HTML を `file://` で開き、リクエスト 1 本・エラー 0 で動作）

## スコープ外

- データ埋め込み HTML（JSON を焼き込んだ 1 ファイル配布）。ADR 0002 で保留とした論点
- auto-update が既定オフであることへの対処。配布経路と独立した制約で、利用者側の設定に属する

## 未確定事項

- **playwright を CI で回す時間**。ブラウザのインストールが毎回走る。PR #1 の CI は全体で 1 分 20 秒だったので現状は許容範囲。増えてきたらキャッシュを検討する
- **GitHub Actions の Node 20 deprecation 警告**。`actions/checkout@v4` / `actions/setup-node@v4` / `actions/configure-pages@v5` / `actions/upload-artifact@v4` / `pnpm/action-setup@v4` が Node 20 をターゲットにしており、runner 側で Node 24 に強制されている旨の警告が `ci.yml` / `deploy.yml` の両方で出る。今すぐ壊れるものではないが、action のメジャーを上げる対応がいずれ要る

### 解決済み

- ~~Ubuntu でのビルドハッシュ~~ → PR #1 で macOS と**完全一致**を確認。バイト一致による鮮度検証が成立する
- ~~biome が 545KB の HTML を検査してしまう~~ → biome 1.9 は `.html` を処理しないため元から無害だった。追加した ignore は将来への予防（Step 2 参照）

- ~~`marketplace.json` にも version が要るのではないか~~ → 不要。`claude plugin tag --dry-run` で `plugin.json` から解決されることを確認（Step 5 参照）
- ~~`plugin.json` の version 運用基準~~ → UI=patch / skill 仕様=minor / 互換破壊=major に決定（Step 4 参照）
- ~~version チェックの比較元~~ → PR ベースに移行して base と比較する（Step 4 参照）
