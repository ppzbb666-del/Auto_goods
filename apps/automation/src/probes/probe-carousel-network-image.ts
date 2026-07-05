// Read-only probe: dump the carousel (产品轮播图) 选择图片 → 网络图片 dialog structure
// so the re-pull adapter knows the real input + add button (don't guess). Opens
// 选择图片, clicks 网络图片, dumps the dialog's textarea/inputs/buttons, then
// closes WITHOUT adding anything. No writes.
// Usage: tsx src/probes/probe-carousel-network-image.ts [--url=...] [--profile=...]
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium, type Locator, type Page } from "playwright"
import { getArgValue, waitForManualLoginIfNeeded } from "../common"
import { inspectDianxiaomiTargetSurface, waitForPublishPage } from "../adapters/dianxiaomi-adapter"
import { loadSelectorConfig } from "../selector-config"

const DEFAULT_URL = "https://www.dianxiaomi.com/web/popTemu/edit?id=161406453047896984"
const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim()

const firstVisible = async (locators: Locator[]) => {
  for (const l of locators) {
    const c = Math.min(await l.count().catch(() => 0), 20)
    for (let i = 0; i < c; i += 1) { const it = l.nth(i); if (await it.isVisible().catch(() => false)) return it }
  }
  return null
}

const main = async () => {
  const targetUrl = getArgValue("url") ?? DEFAULT_URL
  const profileDir = path.resolve(getArgValue("profile") ?? ".runtime/playwright/dianxiaomi-profile")
  const cfg = loadSelectorConfig(".runtime/dianxiaomi-selector-config.json")
  const artifactDir = path.resolve(`.runtime/probe-carousel-network-image-${new Date().toISOString().replace(/[:.]/g, "-")}`)
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
    await page.evaluate(() => { const n = Array.from(document.querySelectorAll("*")).find((x) => /产品轮播图/.test((x as HTMLElement).innerText?.slice(0,20) ?? "")); n?.scrollIntoView({ block: "center" }) }).catch(() => undefined)
    await page.waitForTimeout(1000)

    // open the carousel 选择图片 dropdown
    const chooseTrigger = await firstVisible([
      page.locator(".img-module").getByText(/^选择图片/).first(),
      page.locator(".img-module button, .img-module a, .img-module .ant-dropdown-trigger").filter({ hasText: /选择图片/ }),
      page.getByText(/选择图片/).first()
    ])
    if (!chooseTrigger) { await writeFile(path.join(artifactDir, "probe-carousel-network-image.json"), JSON.stringify({ error: "no 选择图片 trigger" }), "utf8"); console.log(path.join(artifactDir, "probe-carousel-network-image.json")); return }
    await chooseTrigger.scrollIntoViewIfNeeded().catch(() => undefined)
    await chooseTrigger.click().catch(() => undefined)
    await page.waitForTimeout(700)
    const menuItems: string[] = []
    const menu = page.locator(".ant-dropdown:visible li, .ant-dropdown-menu-item:visible")
    const mc = Math.min(await menu.count().catch(() => 0), 12)
    for (let i = 0; i < mc; i += 1) { const t = clean(await menu.nth(i).innerText().catch(() => "")); if (t) menuItems.push(t) }
    const netItem = page.locator(".ant-dropdown:visible li, .ant-dropdown-menu-item:visible").filter({ hasText: /网络图片|网络地址/ }).first()
    if (!(await netItem.isVisible().catch(() => false))) { await writeFile(path.join(artifactDir, "probe-carousel-network-image.json"), JSON.stringify({ menuItems, error: "no 网络图片 menu item" }, null, 2), "utf8"); console.log(path.join(artifactDir, "probe-carousel-network-image.json")); return }
    await netItem.click().catch(() => undefined)
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(artifactDir, "network-dialog.png") }).catch(() => undefined)

    const dialog = page.locator(".ant-modal-content:visible").last()
    const textareas = await dialog.locator("textarea").count().catch(() => 0)
    const inputs: Array<{ ph: string; type: string }> = []
    const inpNodes = dialog.locator("input")
    const ic = Math.min(await inpNodes.count().catch(() => 0), 12)
    for (let i = 0; i < ic; i += 1) { const inp = inpNodes.nth(i); if (!await inp.isVisible().catch(() => false)) continue; inputs.push({ ph: clean(await inp.getAttribute("placeholder").catch(() => "")), type: (await inp.getAttribute("type").catch(() => "")) ?? "" }) }
    const buttons: string[] = []
    const btn = dialog.locator("button, .ant-btn, a, [role='button']")
    const bc = Math.min(await btn.count().catch(() => 0), 20)
    for (let i = 0; i < bc; i += 1) { if (!await btn.nth(i).isVisible().catch(() => false)) continue; const t = clean(await btn.nth(i).innerText().catch(() => "")); if (t) buttons.push(t) }
    const payload = { menuItems, textareaCount: textareas, inputs, buttons: Array.from(new Set(buttons)), textExcerpt: clean(await dialog.innerText().catch(() => "")).slice(0, 400) }
    // close without adding
    const close = await firstVisible([dialog.locator(".ant-modal-close"), page.getByText(/取消|关闭/).first()])
    if (close) await close.click().catch(() => undefined)
    await writeFile(path.join(artifactDir, "probe-carousel-network-image.json"), JSON.stringify(payload, null, 2), "utf8")
    console.log(path.join(artifactDir, "probe-carousel-network-image.json"))
  } finally { await context.close().catch(() => undefined) }
}
main().catch((e) => { console.error(e instanceof Error ? e.stack ?? e.message : String(e)); process.exitCode = 1 })
