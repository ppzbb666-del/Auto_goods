// Read-only probe: dump 896984's live logistics fields — per-SKU 长/宽/高 (skuLength/
// skuWidth/skuHeight, cm) + weight (kg), plus any batch header inputs. Computes Temu
// volumetric weight (材积重 = L×W×H ÷ 抛比) at 抛比=6000 and flags rows where
// 材积重 > 实际重量 (the rule that rejected submit). NO writes.
// Usage: tsx src/probes/probe-sku-logistics.ts [--url=...] [--profile=...] [--divisor=6000]
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium } from "playwright"
import { getArgValue, waitForManualLoginIfNeeded } from "../common"
import { inspectDianxiaomiTargetSurface, waitForPublishPage } from "../adapters/dianxiaomi-adapter"
import { loadSelectorConfig } from "../selector-config"

const DEFAULT_URL = "https://www.dianxiaomi.com/web/popTemu/edit?id=161406453047896984"

const main = async () => {
  const targetUrl = getArgValue("url") ?? DEFAULT_URL
  const profileDir = path.resolve(getArgValue("profile") ?? ".runtime/playwright/dianxiaomi-profile")
  const divisor = Number(getArgValue("divisor") ?? "6000")
  const cfg = loadSelectorConfig(".runtime/dianxiaomi-selector-config.json")
  const artifactDir = path.resolve(`.runtime/probe-sku-logistics-${new Date().toISOString().replace(/[:.]/g, "-")}`)
  await mkdir(artifactDir, { recursive: true })
  const context = await chromium.launchPersistentContext(profileDir, { channel: "chromium", headless: true, viewport: { width: 1440, height: 960 } })
  try {
    const page = context.pages().find((p) => !p.isClosed()) ?? await context.newPage()
    page.setDefaultTimeout(20000)
    if (page.url() !== targetUrl) await page.goto(targetUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined)
    await waitForManualLoginIfNeeded(page)
    await waitForPublishPage(page, cfg, { targetUrl })
    await inspectDianxiaomiTargetSurface(page, cfg)
    await page.waitForTimeout(2500)

    const dump = await page.evaluate((div) => {
      const val = (el: Element | null) => (el as HTMLInputElement | null)?.value ?? ""
      // Per-SKU rows: gather each row's skuLength/skuWidth/skuHeight/weight values.
      const rowInputs = (name: string) => Array.from(document.querySelectorAll(`input[name='${name}']`)) as HTMLInputElement[]
      const lengths = rowInputs("skuLength"), widths = rowInputs("skuWidth"), heights = rowInputs("skuHeight"), weights = rowInputs("weight")
      const rowCount = Math.max(lengths.length, widths.length, heights.length, weights.length)
      const rows = []
      for (let i = 0; i < rowCount; i += 1) {
        const L = parseFloat(val(lengths[i])) || 0
        const W = parseFloat(val(widths[i])) || 0
        const H = parseFloat(val(heights[i])) || 0
        const weightG = parseFloat(val(weights[i])) || 0
        // Dianxiaomi columns are 尺寸(cm) + 重量(g). Temu volumetric weight:
        // 材积重(g) = L(cm)×W(cm)×H(cm) ÷ 抛比(6000) × 1000  ==  L×W×H ÷ 6.
        // Rule: 材积重 must be ≤ actual weight, i.e. L×W×H ≤ 6×weightG.
        const volumetricG = (L * W * H) / div * 1000
        rows.push({ i, L, W, H, weightG, volumetricG: Number(volumetricG.toFixed(2)), maxVolumeCm3: 6 * weightG, actualVolumeCm3: L * W * H, violates: volumetricG > weightG && weightG > 0 })
      }
      // Look for batch header inputs (尺寸(cm)(批量)) — inputs near a 批量 label.
      const batchInputs = Array.from(document.querySelectorAll("input")).filter((el) => {
        const near = (el.closest("[class*='batch' i], th, .ant-table-thead, [class*='header' i]") as HTMLElement | null)?.innerText ?? ""
        return /批量/.test(near)
      }).slice(0, 8).map((el) => ({ name: (el as HTMLInputElement).name, ph: (el as HTMLInputElement).placeholder, value: (el as HTMLInputElement).value }))
      // weight unit label near a weight input
      const weightUnit = (() => {
        const w = document.querySelector("input[name='weight']")
        const around = (w?.closest("td, .ant-form-item, [class*='item' i]") as HTMLElement | null)?.innerText ?? ""
        const m = around.match(/(kg|g|千克|克|公斤)/i)
        return m ? m[1] : "(unknown)"
      })()
      return { divisor: div, rowCount, rows, batchInputs, weightUnit }
    }, divisor)

    const violating = dump.rows.filter((r) => r.violates)
    const payload = { targetUrl, ...dump, violatingRowCount: violating.length, sampleViolations: violating.slice(0, 5) }
    await writeFile(path.join(artifactDir, "probe-sku-logistics.json"), JSON.stringify(payload, null, 2), "utf8")
    console.log(JSON.stringify({ divisor: dump.divisor, rowCount: dump.rowCount, weightUnit: dump.weightUnit, violatingRowCount: violating.length, firstRow: dump.rows[0], sampleViolations: violating.slice(0, 3), batchInputs: dump.batchInputs }, null, 2))
    console.log(path.join(artifactDir, "probe-sku-logistics.json"))
  } finally { await context.close().catch(() => undefined) }
}
main().catch((e) => { console.error(e instanceof Error ? e.stack ?? e.message : String(e)); process.exitCode = 1 })
