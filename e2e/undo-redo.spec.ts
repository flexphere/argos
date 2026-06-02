import { expect, test } from "@playwright/test"

const isMac = process.platform === "darwin"
const cmdKey = isMac ? "Meta" : "Control"

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => {
    window.__argos?.useGraphStore.getState().reset()
    window.__argos?.useGraphStore.temporal.getState().clear()
    window.__argos?.useUIStore.getState().clearSelection()
  })
})

test("ノード追加後、CMD+Z で取り消し、CMD+Shift+Z で復元", async ({ page }) => {
  // 右クリックメニューから議題を追加
  const pane = page.locator(".react-flow__pane")
  await pane.click({ button: "right", position: { x: 400, y: 300 } })
  await page.getByRole("menu").getByText("議題").click()

  // 確認
  let count = await page.evaluate(
    () => window.__argos?.useGraphStore.getState().graph.issues.length ?? 0,
  )
  expect(count).toBe(1)

  // Undo (CMD/Ctrl + Z)
  await page.keyboard.press(`${cmdKey}+z`)
  count = await page.evaluate(
    () => window.__argos?.useGraphStore.getState().graph.issues.length ?? 0,
  )
  expect(count).toBe(0)

  // Redo (CMD/Ctrl + Shift + Z)
  await page.keyboard.press(`${cmdKey}+Shift+z`)
  count = await page.evaluate(
    () => window.__argos?.useGraphStore.getState().graph.issues.length ?? 0,
  )
  expect(count).toBe(1)
})

test("Ctrl+Y でも Redo が動く", async ({ page }) => {
  await page.evaluate(() => {
    window.__argos?.useGraphStore.getState().addClaim({
      text: "C",
      position: { x: 200, y: 200 },
    })
  })
  await page.keyboard.press(`${cmdKey}+z`)
  expect(
    await page.evaluate(() => window.__argos?.useGraphStore.getState().graph.claims.length),
  ).toBe(0)

  await page.keyboard.press(`${cmdKey}+y`)
  expect(
    await page.evaluate(() => window.__argos?.useGraphStore.getState().graph.claims.length),
  ).toBe(1)
})

test("テキスト編集中の CMD+Z はアプリ Undo に飛ばない（ブラウザ標準）", async ({ page }) => {
  // ノードを追加（履歴1件）
  await page.evaluate(() => {
    window.__argos?.useGraphStore.getState().addClaim({
      text: "C",
      position: { x: 200, y: 200 },
    })
  })

  // SidePanel のテキストエリアにフォーカス
  await page.locator(".react-flow__node").first().click()
  const textarea = page.locator("aside textarea").first()
  await textarea.click()
  await textarea.focus()

  // この状態で CMD+Z を押してもアプリ Undo は動かない
  await page.keyboard.press(`${cmdKey}+z`)

  // Claim はまだ残っている
  const count = await page.evaluate(
    () => window.__argos?.useGraphStore.getState().graph.claims.length,
  )
  expect(count).toBe(1)
})
