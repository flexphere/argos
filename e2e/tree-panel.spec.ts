import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => {
    window.__argos?.useGraphStore.getState().reset()
    window.__argos?.useUIStore.getState().clearSelection()
  })
})

test("選択なし状態でツリーが表示され、デフォルトで全て折りたたまれている", async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__argos?.useGraphStore.getState()
    if (!s) return
    const issueId = s.addIssue({ text: "採用すべきか?" })
    const claimId = s.addClaim({ text: "採用すべき" })
    s.addEdge("addresses", claimId, issueId)
    const argId = s.addArgument({
      kind: "pro",
      data: ["コスト削減になる"],
    })
    s.addEdge("supports", argId, claimId)
  })

  const panel = page.getByRole("complementary")
  // ツリーヘッダの「全て展開」ボタンが存在することで、ツリー領域が表示されていることを確認
  await expect(panel.getByRole("button", { name: "全て展開" })).toBeVisible()
  // ルート（Issue）は表示される
  await expect(panel.getByText("採用すべきか?", { exact: true })).toBeVisible()
  // デフォルトで折りたたみ → 子は非表示
  await expect(panel.getByText("採用すべき", { exact: true })).toBeHidden()
  await expect(panel.getByText("コスト削減になる", { exact: true })).toBeHidden()
})

test("ヘッダーの「全て展開」アイコンで全階層が展開される", async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__argos?.useGraphStore.getState()
    if (!s) return
    const issueId = s.addIssue({ text: "採用すべきか?" })
    const claimId = s.addClaim({ text: "採用すべき" })
    s.addEdge("addresses", claimId, issueId)
    const argId = s.addArgument({
      kind: "pro",
      data: ["コスト削減になる"],
    })
    s.addEdge("supports", argId, claimId)
  })

  const panel = page.getByRole("complementary")
  await panel.getByRole("button", { name: "全て展開" }).click()
  await expect(panel.getByText("採用すべき", { exact: true })).toBeVisible()
  await expect(panel.getByText("コスト削減になる", { exact: true })).toBeVisible()
})

test("ヘッダーの「全て折りたたむ」アイコンで全階層が折りたたまれる", async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__argos?.useGraphStore.getState()
    if (!s) return
    const issueId = s.addIssue({ text: "議題A" })
    const claimId = s.addClaim({ text: "主張A" })
    s.addEdge("addresses", claimId, issueId)
  })

  const panel = page.getByRole("complementary")
  // 一度全展開してから全折りたたみ
  await panel.getByRole("button", { name: "全て展開" }).click()
  await expect(panel.getByText("主張A", { exact: true })).toBeVisible()
  await panel.getByRole("button", { name: "全て折りたたむ" }).click()
  await expect(panel.getByText("主張A", { exact: true })).toBeHidden()
})

test("ツリーのラベルクリックは選択せず、グラフを中央へ移動するだけ", async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__argos?.useGraphStore.getState()
    if (!s) return
    s.addIssue({ text: "テスト議題", position: { x: 800, y: 600 } })
  })

  const panel = page.getByRole("complementary")
  await panel.getByRole("button", { name: /open テスト議題/ }).click()

  // 選択されないので NodePanel に切り替わらず、ツリーが残る
  await expect(panel.getByRole("button", { name: "全て展開" })).toBeVisible()

  // UI store の選択も空のまま
  const selected = await page.evaluate(
    () => window.__argos?.useUIStore.getState().selectedNodeIds.length ?? 0,
  )
  expect(selected).toBe(0)
})

test("どの Issue にも紐付かない Claim は未配置グループに表示される", async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__argos?.useGraphStore.getState()
    if (!s) return
    s.addClaim({ text: "孤立した主張" })
  })

  const panel = page.getByRole("complementary")
  await expect(panel.getByText(/未配置のノード/)).toBeVisible()
  // 未配置グループ自体はデフォルトで折りたたみなので、中身を見るには展開する
  await panel.getByRole("button", { name: "全て展開" }).click()
  await expect(panel.getByText("孤立した主張", { exact: true })).toBeVisible()
})
