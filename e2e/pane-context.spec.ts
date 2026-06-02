import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => {
    window.__argos?.useGraphStore.getState().reset()
    window.__argos?.useUIStore.getState().clearSelection()
  })
})

test("ペイン右クリックで追加メニューが開く", async ({ page }) => {
  const pane = page.locator(".react-flow__pane")
  await pane.click({ button: "right", position: { x: 400, y: 300 } })
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  await expect(menu.getByText(/議題/)).toBeVisible()
  await expect(menu.getByText(/主張/)).toBeVisible()
  await expect(menu.getByText(/論証/)).toBeVisible()
})

test("右クリック→「議題」でカーソル位置に Issue が作成される", async ({ page }) => {
  const pane = page.locator(".react-flow__pane")
  await pane.click({ button: "right", position: { x: 400, y: 300 } })
  await page.getByRole("menu").getByText("議題").click()

  const result = await page.evaluate(() => {
    const issues = window.__argos?.useGraphStore.getState().graph.issues ?? []
    return {
      count: issues.length,
      pos: issues[0]?.position,
    }
  })
  expect(result.count).toBe(1)
  expect(result.pos).toBeDefined()
  // Position は flow 座標系（screenToFlowPosition で変換済み）。値そのものは fitView 等に依存するので存在チェックのみ
  expect(typeof result.pos?.x).toBe("number")
  expect(typeof result.pos?.y).toBe("number")
})

test("ノード上の右クリックは追加メニューではなく削除メニューになる", async ({ page }) => {
  await page.evaluate(() => {
    window.__argos?.useGraphStore.getState().addClaim({
      text: "claim",
      position: { x: 200, y: 200 },
    })
  })
  await page.locator(".react-flow__node").first().click({ button: "right" })
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  await expect(menu.getByText("削除")).toBeVisible()
  // 追加項目は出ない
  await expect(menu.getByText("議題")).toHaveCount(0)
})
