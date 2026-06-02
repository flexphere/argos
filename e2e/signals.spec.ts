import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => {
    window.__argos?.useGraphStore.getState().reset()
    window.__argos?.useUIStore.getState().clearSelection()
  })
})

test("無選択時、シグナル全体サマリが SidePanel に表示される", async ({ page }) => {
  // 未根拠の主張を持つ Claim を入れる
  await page.evaluate(() => {
    const s = window.__argos?.useGraphStore.getState()
    if (!s) return
    s.addClaim({ text: "未根拠の主張", position: { x: 200, y: 200 } })
  })

  const panel = page.getByRole("complementary")
  // ツリーパネルにも「未根拠の主張」テキストのノードが現れるため、シグナル
  // セクション内に限定したアサーションにする
  const signals = panel.locator(".signals-section")
  await expect(signals.getByText("考慮漏れシグナル")).toBeVisible()
  await expect(signals.getByText("未根拠の主張")).toBeVisible()
})

test("ノードを選択するとそのノードのシグナルだけ表示される", async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__argos?.useGraphStore.getState()
    if (!s) return
    s.addClaim({ text: "主張のテキスト", position: { x: 200, y: 200 } })
  })

  await page.locator(".react-flow__node").first().click()
  const panel = page.getByRole("complementary")
  await expect(panel.getByText("このノードのシグナル")).toBeVisible()
  await expect(panel.locator("li.signal-item").getByText("未根拠の主張")).toBeVisible()
})

test("ノード本体に警告バッジが表示される", async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__argos?.useGraphStore.getState()
    if (!s) return
    s.addClaim({ text: "支持なし", position: { x: 200, y: 200 } })
  })
  // ノード本体に "未根拠の主張" バッジが含まれる
  const node = page.locator(".react-flow__node").first()
  await expect(node.getByText("未根拠の主張")).toBeVisible()
})

test("支持エッジを追加すると未根拠シグナルが消える", async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__argos?.useGraphStore.getState()
    if (!s) return
    const c = s.addClaim({ text: "X", position: { x: 200, y: 200 } })
    const a = s.addArgument({ position: { x: 200, y: 400 } })
    s.addEdge("supports", a, c)
  })
  // Claim ノード（最初）に "未根拠の主張" バッジが無い
  const claim = page.locator(".react-flow__node").first()
  await expect(claim.getByText("未根拠の主張")).not.toBeVisible()
})

test("シグナルをアコーディオン展開→影響ノードクリックでビューポートが中央移動（選択はしない）", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.__argos?.useGraphStore.getState().addClaim({
      text: "未根拠の主張テスト",
      position: { x: 1500, y: 1200 }, // 初期ビューから離れた位置
    })
  })

  const panel = page.getByRole("complementary")
  await panel.locator("button.signal-row-button").filter({ hasText: "未根拠の主張" }).click()
  const child = panel
    .locator("button.signal-child-button")
    .filter({ hasText: "未根拠の主張テスト" })
  await expect(child).toBeVisible()

  // クリック前のビューポート transform を取得
  const beforeTransform = await page.evaluate(
    () => document.querySelector(".react-flow__viewport")?.getAttribute("style") ?? "",
  )

  await child.click()
  // setCenter は 500ms かけて移動するので待つ
  await page.waitForTimeout(700)

  const afterTransform = await page.evaluate(
    () => document.querySelector(".react-flow__viewport")?.getAttribute("style") ?? "",
  )

  // ビューポートが変化した（中央移動された）
  expect(afterTransform).not.toBe(beforeTransform)

  // 選択はされない
  const selected = await page.evaluate(() => window.__argos?.useUIStore.getState().selectedNodeIds)
  expect(selected).toEqual([])
})
