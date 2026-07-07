// Real-machine verification for normalize-sku-logistics: navigates to a product,
// calls the PRODUCTION normalizeSkuLogistics(), and reports the step result plus
// a re-read confirming no SKU row violates 材积重 ≤ 实际重量. Mutates the draft's
// dimension fields but does NOT save/submit.
// Usage: tsx src/probes/probe-sku-logistics-fix.ts [--url=...] [--profile=...]
import { chromium } from "playwright"
import { getArgValue, waitForManualLoginIfNeeded } from "../common"
import { inspectDianxiaomiTargetSurface, normalizeSkuLogistics, waitForPublishPage } from "../adapters/dianxiaomi-adapter"
import { loadSelectorConfig } from "../selector-config"

const DEFAULT_URL = "https://www.dianxiaomi.com/web/popTemu/edit?id=161406453047896984"

const main = async () => {
  const targetUrl = getArgValue("url") ?? DEFAULT_URL
  const profileDir = getArgValue("profile") ?? ".runtime/playwright/dianxiaomi-profile"
  const cfg = loadSelectorConfig(".runtime/dianxiaomi-selector-config.json")
  const context = await chromium.launchPersistentContext(profileDir, { channel: "chromium", headless: true, viewport: { width: 1440, height: 960 } })
  try {
    const page = context.pages().find((p) => !p.isClosed()) ?? await context.newPage()
    page.setDefaultTimeout(20000)
    if (page.url() !== targetUrl) await page.goto(targetUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined)
    await waitForManualLoginIfNeeded(page)
    await waitForPublishPage(page, cfg, { targetUrl })
    await inspectDianxiaomiTargetSurface(page, cfg)
    await page.waitForTimeout(2500)

    const result = await normalizeSkuLogistics(page)
    // independent re-read to double-check the rule holds now
    const after = await page.evaluate(() => {
      const v = (el: Element | null) => parseFloat((el as HTMLInputElement | null)?.value ?? "") || 0
      const L = Array.from(document.querySelectorAll("input[name='skuLength']")) as HTMLInputElement[]
      const W = Array.from(document.querySelectorAll("input[name='skuWidth']")) as HTMLInputElement[]
      const H = Array.from(document.querySelectorAll("input[name='skuHeight']")) as HTMLInputElement[]
      const wt = Array.from(document.querySelectorAll("input[name='weight']")) as HTMLInputElement[]
      const rows = []
      for (let i = 0; i < Math.max(L.length, wt.length); i += 1) {
        const l = v(L[i]), w = v(W[i]), h = v(H[i]), g = v(wt[i])
        rows.push({ i, l, w, h, g, volG: Number(((l * w * h) / 6000 * 1000).toFixed(1)), violates: (l * w * h) / 6000 * 1000 > g && g > 0 })
      }
      return { rows, stillViolating: rows.filter((r) => r.violates).length }
    })
    console.log("step:", result.status, "|", result.detail)
    console.log("corrections:", JSON.stringify((result.data as { corrections?: unknown })?.corrections ?? []).slice(0, 500))
    console.log("after re-read stillViolating:", after.stillViolating, "| firstRow:", JSON.stringify(after.rows[0]), "| lastRow:", JSON.stringify(after.rows[after.rows.length - 1]))
    console.log("VERDICT:", result.status === "done" && after.stillViolating === 0 ? "FIXED-ALL" : "NOT-FULLY-FIXED")
  } finally { await context.close().catch(() => undefined) }
}
main().catch((e) => { console.error(e instanceof Error ? e.stack ?? e.message : String(e)); process.exitCode = 1 })
