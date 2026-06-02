import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => {
    window.__argos?.useGraphStore.getState().reset()
    window.__argos?.useUIStore.getState().clearSelection()
  })
})

test("MiniMap renders all nodes after they are measured", async ({ page }) => {
  // ノードを 3 つ追加（Issue / Claim / Argument 各 1）
  await page.evaluate(() => {
    const store = window.__argos?.useGraphStore.getState()
    if (!store) throw new Error("store not exposed")
    const issueId = store.addIssue({ text: "採用すべきか?" })
    const claimId = store.addClaim({ text: "採用すべき" })
    store.addEdge("addresses", claimId, issueId)
    const argId = store.addArgument({
      kind: "pro",
      data: ["コスト削減になる"],
    })
    store.addEdge("supports", argId, claimId)
  })

  // ResizeObserver 経由の測定が onNodesChange→measurements に届くまで待つ
  await expect
    .poll(
      async () => {
        return page.evaluate(() => document.querySelectorAll(".react-flow__minimap-node").length)
      },
      { timeout: 3000, intervals: [100, 200, 500] },
    )
    .toBe(3)

  // MiniMap rect が実寸ベースの fill を持つ（透過になっていないこと）を簡易確認
  const sample = await page.evaluate(() => {
    const node = document.querySelector(".react-flow__minimap-node")
    if (!node) return null
    return {
      width: node.getAttribute("width"),
      height: node.getAttribute("height"),
      fill: getComputedStyle(node).fill,
    }
  })
  expect(sample).not.toBeNull()
  expect(Number(sample?.width)).toBeGreaterThan(0)
  expect(Number(sample?.height)).toBeGreaterThan(0)
})
