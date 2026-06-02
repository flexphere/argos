import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => {
    window.__argos?.useGraphStore.getState().reset()
    window.__argos?.useUIStore.getState().clearSelection()
  })
})

const readSelection = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.__argos?.useUIStore.getState().selectedNodeIds ?? [])

const seedTwoClaims = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const s = window.__argos?.useGraphStore.getState()
    if (!s) return
    s.addClaim({ text: "A", position: { x: 200, y: 200 } })
    s.addClaim({ text: "B", position: { x: 450, y: 200 } })
  })

test("clicking a node selects it and shows side panel details", async ({ page }) => {
  await page.evaluate(() =>
    window.__argos?.useGraphStore.getState().addClaim({
      text: "TEST_CLAIM_TEXT",
      position: { x: 250, y: 250 },
    }),
  )

  await page.locator(".react-flow__node").first().click()

  const selected = await readSelection(page)
  expect(selected.length).toBe(1)

  await expect(page.getByRole("complementary")).toContainText("CLAIM")
  await expect(page.getByRole("complementary").locator("textarea").first()).toHaveValue(
    "TEST_CLAIM_TEXT",
  )
})

test("clicking a different node replaces selection (no lag)", async ({ page }) => {
  await seedTwoClaims(page)
  const nodes = page.locator(".react-flow__node")

  await nodes.nth(0).click()
  let selected = await readSelection(page)
  expect(selected.length).toBe(1)
  const firstId = selected[0]

  await nodes.nth(1).click()
  selected = await readSelection(page)
  expect(selected.length).toBe(1)
  expect(selected[0]).not.toBe(firstId)
})

test("Cmd/Ctrl+click adds to existing selection", async ({ page }) => {
  await seedTwoClaims(page)
  const nodes = page.locator(".react-flow__node")

  await nodes.nth(0).click()
  await nodes.nth(1).click({ modifiers: ["Meta"] })

  const selected = await readSelection(page)
  expect(selected.length).toBe(2)
})

test("clicking the pane clears selection", async ({ page }) => {
  await seedTwoClaims(page)
  await page.locator(".react-flow__node").first().click()
  expect((await readSelection(page)).length).toBe(1)

  await page.locator(".react-flow__pane").click({ position: { x: 800, y: 500 } })
  expect((await readSelection(page)).length).toBe(0)
})
