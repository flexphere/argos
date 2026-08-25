import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { expect, test } from "@playwright/test"

/**
 * skill が生成する「データを焼き込んだ配布用 HTML」の E2E。
 *
 * 実際に embed-fixture.mjs を回して HTML を作り、file:// で開く。
 * 議事録には `<` が普通に含まれるため、`</script>` を含む fixture を
 * わざと通して script ブロックが壊れないことを実データ相当で確認する。
 * 詳細は docs/adr/0003-embed-data-in-html.md。
 */

const OUT_DIR = path.join(process.cwd(), "test-results", "embedded")
const TEMPLATE = path.join(process.cwd(), ".claude/skills/argos/assets/argos.html")
const EMBED_SCRIPT = path.join(process.cwd(), ".claude/skills/argos/scripts/embed-fixture.mjs")

const FIXTURE = {
  issues: [{ ref: "issue-1", text: "テンプレート内の </script> をどう扱うか？" }],
  claims: [
    { ref: "claim-1", text: "エスケープすれば <script> でも安全", addresses: "issue-1" },
    { ref: "claim-2", text: "<!-- コメント --> も素通しすべき", addresses: "issue-1" },
  ],
  arguments: [
    { ref: "arg-1", kind: "pro" as const, data: "< を置換すれば無効化される", targets: "claim-1" },
  ],
}

let embeddedUrl: string
let plainUrl: string

test.beforeAll(() => {
  mkdirSync(OUT_DIR, { recursive: true })
  const fixturePath = path.join(OUT_DIR, "fixture.json")
  const outPath = path.join(OUT_DIR, "embedded.html")
  writeFileSync(fixturePath, JSON.stringify(FIXTURE), "utf8")

  execFileSync(
    "node",
    [EMBED_SCRIPT, "--fixture", fixturePath, "--template", TEMPLATE, "--out", outPath],
    { stdio: "pipe" },
  )

  embeddedUrl = pathToFileURL(outPath).href
  plainUrl = pathToFileURL(TEMPLATE).href
})

test("埋め込み HTML は Import 操作なしでグラフを表示する", async ({ page }) => {
  await page.goto(embeddedUrl)
  // issue 1 + claim 2 + argument 1
  await expect(page.locator(".react-flow__node")).toHaveCount(4)
})

test("`</script>` を含むテキストが壊れずに復元される", async ({ page }) => {
  await page.goto(embeddedUrl)
  await expect(page.locator(".react-flow__node")).toHaveCount(4)
  const texts = await page.locator(".react-flow__node").allInnerTexts()
  expect(texts.some((t) => t.includes("</script>"))).toBe(true)
  expect(texts.some((t) => t.includes("<script>"))).toBe(true)
  expect(texts.some((t) => t.includes("<!-- コメント -->"))).toBe(true)
})

test("埋め込み HTML は localStorage を書き換えない", async ({ page }) => {
  await page.goto(embeddedUrl)
  await expect(page.locator(".react-flow__node")).toHaveCount(4)
  const keys = await page.evaluate(() => Object.keys(localStorage))
  expect(keys).not.toContain("argos-graph")
})

test("埋め込みの無いテンプレートは従来どおり空グラフで起動する", async ({ page }) => {
  await page.goto(plainUrl)
  await expect(page.locator(".react-flow")).toHaveCount(1)
  await expect(page.locator(".react-flow__node")).toHaveCount(0)
})

test("Export した HTML を開くと同じグラフが復元される (往復)", async ({ page }) => {
  await page.goto(embeddedUrl)
  await expect(page.locator(".react-flow__node")).toHaveCount(4)

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: /Export/ }).click()
  await page.getByRole("menu").getByText("HTML", { exact: true }).click()
  const download = await downloadPromise

  const roundTripPath = path.join(OUT_DIR, "round-trip.html")
  await download.saveAs(roundTripPath)

  await page.goto(pathToFileURL(roundTripPath).href)
  await expect(page.locator(".react-flow__node")).toHaveCount(4)

  const texts = await page.locator(".react-flow__node").allInnerTexts()
  expect(texts.some((t) => t.includes("</script>"))).toBe(true)
})
