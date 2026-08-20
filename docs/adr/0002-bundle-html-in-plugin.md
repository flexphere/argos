# ADR 0002: ビルド済み単一 HTML を plugin に同梱する

- Status: Proposed
- Date: 2026-08-20
- 関連: [ADR 0001](./0001-vite-singlefile-html.md)

## 背景

[ADR 0001](./0001-vite-singlefile-html.md) でビルド成果物を `dist/index.html` 1 枚にした結果、argos は「HTML 1 ファイルと skill が出す JSON さえあれば動く」状態になった。`file://` で開けるため静的サーバーも不要になり、**ネットワークから切り離された環境でも完結できる**ようになった。

ところが **plugin 利用者がその HTML を入手する経路がない**。`.claude-plugin/plugin.json` が配っているのは `skills` だけで、HTML は含まれていない。`/plugin install argos@argos` した利用者に残された選択肢は、

- ホスト版 https://flexphere.github.io/argos/ を開く（＝ネットワーク必須）
- リポジトリを clone して `pnpm build` する（＝ローカルビルドが必要）

の二択のままで、ADR 0001 で得た利点が配布経路で失われている。

### 調査で判明した2つの事実

**1. skill と UI のバージョンは現状ズレる。**

`save-fixture.mjs` は `src/schema/*` を esbuild で bundle した成果物であり、ブラウザ側の HTML も同じ `src/schema` から作られる。両者は**同一ソースから生成される2つの成果物**である。

しかし現在の配布経路では、skill は plugin の version 管理下にあり、UI はホスト版（main push のたびに CI が最新をビルド）にある。third-party marketplace の auto-update は既定オフ（[Claude Code docs](https://code.claude.com/docs/en/discover-plugins) の "Configure auto-updates"）なので、**「skill は数バージョン前、UI は最新」が標準的な状態**になる。

**2. ビルドは決定的である。**

同一環境で 3 回、および Node 24.18.1 / 22.22.2 の 2 バージョンでビルドし、`dist/index.html` の SHA-256 が全て `41dbfcfb…ecabc1d0` で一致することを実測した。CI（Node 22 / Ubuntu）と手元（Node 24 / macOS）でハッシュが揺れないため、**生成物の鮮度を CI で機械的に検証しても誤検知しない**。OS 差だけは実測できていないが、Node のメジャー差で揺れない以上、残リスクは小さいと判断する。

## 採用案

**ビルド済みの単一 HTML を `.claude/skills/argos/assets/argos.html` として git track し、plugin に同梱する。** 併せて、生成物の鮮度を保証する CI を整備する（[プラン](../plan/bundle-html-and-ci.md)）。

採用理由:

1. **オフライン完結を配布経路でも維持できる。** ADR 0001 で取りに行った最大の利点をそのまま利用者に届けられる。社外に出せない議事録を扱う場合、ホスト版を経由しない選択肢があることに意味がある
2. **skill と UI のバージョン整合が構造的に保たれる。** 両者が同一 plugin に入り、同一 `version` で一括更新されるため、上記「事実1」のズレが原理的に発生しない。利用者が古い版を使っている場合も「両方古い」ので整合は保たれる
3. **ビルドが決定的なので CI ガードが機能する。** 「事実2」により、生成物の再生成忘れと version bump 忘れを CI で確実に検出できる

## 不採用案

### 1. GitHub Releases に添付し、skill が実行時に取得する

`claude plugin tag` で `{name}--v{version}` の git tag を作る仕組みが公式に用意されており、release 作成の自動化も容易。リポジトリが太らない点も魅力だった。

不採用の理由は2つ。

- **オフライン初回が成立しない。** 実行時 fetch は ADR 0001 で得た「閉じた環境で完結できる」という利点と正面から衝突する
- **skill と UI が独立して更新されるため、上記「事実1」のズレが解消されない。** skill は plugin の version 管理下、HTML は release 側と、2つの更新系が並走する

なお「古い JSON には対応する世代の release HTML を使えばよい」という利点も検討したが、これは fixture に生成元バージョンを記録する仕組みが前提になる（現状 `extractionResultSchema` にバージョンフィールドはない）。かつ、スキーマの後方互換を規約として守る、あるいはデータ埋め込み HTML を採用すれば、そもそも必要にならない。この論点は本 ADR では決着させず、別途扱う。

### 2. 現状維持（ホスト版のみ）

ローカル完結ができず、skill と UI のバージョンも常にズレる。ADR 0001 の成果を活かせないため不採用。

## 結果・影響

**得られるもの**

- plugin を入れるだけで、ネットワークなしに argos が使えるようになる
- skill と UI のバージョンが必ず揃う

**代償**

- **リポジトリが更新のたび太る。** 545KB の HTML はミニファイ済み 1 行 JS を含むため、UI の変更量に関わらず毎回ほぼ全置換の diff になる。zlib 後で 1 更新あたり約 160KB の見積もり。UI が頻繁に変わるフェーズを過ぎれば実質止まる
- **version bump が必須になる。** `plugin.json` の `version` は「set されている場合、bump しない限り利用者に更新が届かない」（[Claude Code docs](https://code.claude.com/docs/en/plugins)）。HTML を差し替えたら必ず上げる必要があり、これは CI で強制する

**この案でも解消しないもの**

- third-party marketplace の auto-update が既定オフである以上、利用者が `/plugin marketplace update` を叩くか auto-update を有効にするまで更新は届かない。これは配布経路の選択とは独立した制約で、どの案を採っても残る

**副次的に塞がる既存の穴**

CI ガードは HTML だけでなく `save-fixture.mjs` にも同じ形で必要になる。`scripts/build-skill.mjs` は「出力先のファイルは Git track 対象とし、配布時に常に最新が含まれる状態を保つ」と方針を宣言しているが、それを保証する仕組みが存在しない。実際 `608c713` で `src/schema/semantic.ts` を変更した際に bundle は再生成されておらず、変更が JSDoc コメントのみで esbuild の `legalComments: "none"` に落とされたため偶然実害が出なかった、というのが現状である。今回の CI 整備でこの穴も同時に塞ぐ。

## 保留する論点

以下は本 ADR の範囲外とし、必要になった時点で別 ADR を起こす。

- **データ埋め込み HTML**（JSON を HTML に焼き込んで 1 ファイルで配る）。バージョン整合問題の根本解決になりうるが、配布経路の決定とは独立
- **スキーマ互換方針**（新しい UI が古い JSON を常に読めることを規約とするか）
