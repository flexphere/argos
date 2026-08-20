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

## Step 分割

step ごとにコミットを分ける。

### Step 1: 品質センサー CI の新設

他の step と独立していて、単体で価値が出るので先に入れる。

- `.github/workflows/ci.yml` を新設。PR と main push で起動
- `npx tsc --noEmit` / `npx biome check .` / `npm test` / `npm run check:dead` を実行
- `npx playwright test` を実行（ブラウザのインストール step が要る。キャッシュを検討）
- `HUSKY: "0"` は `deploy.yml` と同様に設定
- **併せて `pnpm build` して `dist/index.html` の SHA-256 を出力するだけの step を置く**。ADR 0002 の前提（ビルドが決定的）が Ubuntu でも成り立つかを、生成物をコミットする前に確認するため。手元の実測値 `41dbfcfb…ecabc1d0` と突き合わせる

**確認**: PR を作って全 job が緑になる。かつ Ubuntu のビルドハッシュが手元と一致する

**ここでハッシュが一致しなければ Step 2 に進まず、「未確定事項」に従って方針を見直す。** 生成物をコミットした後に前提が崩れると手戻りが大きいため、この step で潰しておく。

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

**確認**: `pnpm build` 後に `git status` がクリーン（＝コミット済みと一致）

### Step 3: 生成物の鮮度チェックを CI に追加

ADR の根拠となった「ビルドは決定的」を CI 上で実証する step でもある。

```yaml
- run: pnpm build
- run: pnpm build:skill
- run: git diff --exit-code -- .claude/skills/argos/assets/argos.html .claude/skills/argos/scripts/save-fixture.mjs
```

- 差分検出時のメッセージで対処を案内する（`pnpm build && pnpm build:skill` を実行して commit する、と）
- **この step で Ubuntu ビルドのハッシュが手元と一致するかが判明する**。一致しなければ ADR の前提が崩れるので、その場合は「未確定事項」に従って方針を見直す

**確認**: 生成物を古いまま push した PR が落ち、再生成した PR が通る

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

**確認**: 生成物だけ変えて version 据え置きの PR が落ちる

### Step 5: plugin としての動作確認とドキュメント

- `claude --plugin-dir ./` で実際に読み込み、`/argos` skill が認識されること、同梱 HTML が期待の場所にあることを確認
- `plugin.json` の `version` を 0.1.0 から上げる（同梱物が増えるため）
- ADR 0002 の Status を `Proposed` → `Accepted` に更新し、Step 3 で判明した Ubuntu ビルドの結果を追記

**確認**: 上記が全て通る

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

- `pnpm build` 後に作業ツリーがクリーンになる（生成物がコミット済みと一致）
- 生成物を古いまま push した PR が CI で落ちる
- 生成物を変えて version を据え置いた PR が CI で落ちる
- `npx tsc --noEmit` / `npx biome check .` / `npm test` / `npx playwright test` / `npm run check:dead` が CI で緑
- `claude plugin validate ./` が通る
- plugin をインストールした利用者が、ネットワークなしで argos を開ける

## スコープ外

- データ埋め込み HTML（JSON を焼き込んだ 1 ファイル配布）。ADR 0002 で保留とした論点
- スキーマ互換方針の明文化。同上
- auto-update が既定オフであることへの対処。配布経路と独立した制約で、利用者側の設定に属する

## 未確定事項

- **Ubuntu でのビルドハッシュ**。手元では Node 24 / 22 の両方で一致を確認済みだが、OS 差は CI を回すまで分からない。もし Ubuntu で異なるハッシュが出た場合、鮮度チェックは「バイト一致」では成立しない。その場合の代替は、(a) CI をビルド環境の正とし手元では検証しない、(b) 比較を意味的な単位に緩める、(c) CI が生成物を自動コミットする、のいずれか。Step 3 の結果を見て判断する
- **playwright を CI で回す時間**。ブラウザのインストールが毎回走ると重い。キャッシュで抑えるか、PR では unit のみ・main では E2E も、と分ける案もある。まず素直に入れて実測してから判断する

### 解決済み

- ~~`marketplace.json` にも version が要るのではないか~~ → 不要。`claude plugin tag --dry-run` で `plugin.json` から解決されることを確認（Step 5 参照）
- ~~`plugin.json` の version 運用基準~~ → UI=patch / skill 仕様=minor / 互換破壊=major に決定（Step 4 参照）
- ~~version チェックの比較元~~ → PR ベースに移行して base と比較する（Step 4 参照）
