/**
 * skill が生成する配布用 HTML に議論データを焼き込むための規約。
 *
 * 書き出す側 (scripts/embed-fixture.ts) と読む側 (src/io/embeddedFixture.ts)、
 * および永続化の可否を判断する側 (src/store/graphStore.ts) の三者が
 * ここを参照する。schema はどの層からも import できるため、依存方向を壊さない。
 *
 * 詳細は docs/adr/0003-embed-data-in-html.md。
 */

/** 埋め込みデータを置く `<script type="application/json">` の id */
export const EMBEDDED_DATA_ELEMENT_ID = "argos-embedded-data"

/**
 * JSON 文字列を `<script>` の中に置ける形にエスケープする。
 *
 * `<` を落とさないと、データ中の `</script>` が script ブロックを閉じて
 * ページが壊れる。議事録には `<` が普通に含まれるため実データで踏む。
 * `<!--` も同時に無効化される。
 *
 * `<` は JSON の文字列エスケープとして valid なので、`JSON.parse` すれば
 * 元の文字列に戻る。読む側に特別な処理は要らない。
 *
 * U+2028 / U+2029 はエスケープしない。これらが問題になるのは JSON を JS の
 * ソースとして評価する場合であり、`type="application/json"` の textContent を
 * `JSON.parse` する本方式では該当しない (ES2019 の JSON superset により
 * `JSON.parse` は生の U+2028 を受け付ける)。
 */
export function escapeForScriptTag(json: string): string {
  return json.replace(/</g, "\\u003c")
}
