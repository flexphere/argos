import { describe, expect, it } from "vitest"
import { EMBEDDED_DATA_ELEMENT_ID, escapeForScriptTag } from "../src/schema/embedded"

/**
 * 埋め込みデータのエスケープ規約 (docs/adr/0003-embed-data-in-html.md)。
 *
 * ここが壊れると、議事録に `</script>` を含むデータを焼き込んだ瞬間に
 * 配布 HTML が壊れる。実データで初めて踏む類の不具合なので機械で守る。
 */
describe("escapeForScriptTag", () => {
  it("要素 ID は規約どおり", () => {
    expect(EMBEDDED_DATA_ELEMENT_ID).toBe("argos-embedded-data")
  })

  it("< を \\u003c に置き換える", () => {
    expect(escapeForScriptTag("a<b")).toBe("a\\u003cb")
  })

  it("エスケープ後の文字列に < が残らない", () => {
    const json = JSON.stringify({ text: "</script><script>alert(1)</script>" })
    const escaped = escapeForScriptTag(json)
    expect(escaped).not.toContain("<")
  })

  it("エスケープしても JSON.parse で元のデータに戻る", () => {
    const original = {
      issues: [{ ref: "issue-1", text: "A </script> B <!-- C --> D <div>" }],
      claims: [],
      arguments: [],
    }
    const escaped = escapeForScriptTag(JSON.stringify(original))
    expect(JSON.parse(escaped)).toEqual(original)
  })

  it("HTML に埋め込んだ後でも script ブロックが途中で閉じない", () => {
    const fixture = { issues: [{ ref: "i1", text: "終了タグ </script> を含む発言" }] }
    const html = `<script type="application/json" id="${EMBEDDED_DATA_ELEMENT_ID}">${escapeForScriptTag(
      JSON.stringify(fixture),
    )}</script>`

    // script の終了タグはテンプレート側の 1 個だけであるべき
    expect(html.match(/<\/script>/g)).toHaveLength(1)

    // 実際に中身を取り出して復元できる
    const body = html.slice(html.indexOf(">") + 1, html.lastIndexOf("</script>"))
    expect(JSON.parse(body)).toEqual(fixture)
  })

  it("U+2028 / U+2029 はそのまま通す (JSON.parse が受け付けるため)", () => {
    const withSeparators = {
      text: `a${String.fromCodePoint(0x2028)}b${String.fromCodePoint(0x2029)}c`,
    }
    const escaped = escapeForScriptTag(JSON.stringify(withSeparators))
    expect(JSON.parse(escaped)).toEqual(withSeparators)
  })
})
