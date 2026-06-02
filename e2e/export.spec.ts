import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => {
    window.__argos?.useGraphStore.getState().reset()
    window.__argos?.useUIStore.getState().clearSelection()
  })
})

test("Export ボタンをクリックでドロップダウンが開き、2つの形式が選べる", async ({ page }) => {
  await page.getByRole("button", { name: /Export/ }).click()
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  await expect(menu.getByText("JSON", { exact: true })).toBeVisible()
  await expect(menu.getByText("Markdown (.md)")).toBeVisible()
  // Mermaid / PNG は削除されたので表示されない
  await expect(menu.getByText("Mermaid (.mmd)")).toHaveCount(0)
  await expect(menu.getByText("PNG", { exact: true })).toHaveCount(0)
})

test("Escape キーでドロップダウンが閉じる", async ({ page }) => {
  await page.getByRole("button", { name: /Export/ }).click()
  await expect(page.getByRole("menu")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).not.toBeVisible()
})

test("Markdown 選択で .md ファイルがダウンロードされる", async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__argos?.useGraphStore.getState()
    if (!s) return
    s.addIssue({ text: "I", position: { x: 100, y: 100 } })
  })

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: /Export/ }).click()
  await page.getByRole("menu").getByText("Markdown (.md)").click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^argos-\d{8}-\d{4}\.md$/)
})

test("JSON 選択で .json ファイルがダウンロードされる", async ({ page }) => {
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: /Export/ }).click()
  await page.getByRole("menu").getByText("JSON", { exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^argos-\d{8}-\d{4}\.json$/)
})
