// Read-only probe: dump the native Dianxiaomi carousel (产品轮播图) media-tool
// dialogs so we know which one can make images 1:1 — BEFORE writing any adapter
// logic (no guessing). Opens the 编辑图片/批量 dropdown near the carousel, dumps
// its menu items, then opens the batch-resize and image-editor dialogs and dumps
// their real select options / checkboxes / buttons. No writes: never clicks an
// apply/生成/确定 action, closes each dialog afterward.
// Usage: tsx src/probes/probe-carousel-media-tools.ts [--url=...] [--profile=...]
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

// Dump every ant-select's options, checkboxes, buttons and inputs inside a dialog.
const dumpDialog = async (dialog: Locator, page: Page) => {
  // expand each ant-select to read its dropdown options (read-only: open, read, Escape)
  const selectDump: Array<{ current: string; options: string[] }> = []
  const selects = dialog.locator(".ant-select")
  const sc = Math.min(await selects.count().catch(() => 0), 6)
  for (let i = 0; i < sc; i += 1) {
    const sel = selects.nth(i)
    if (!await sel.isVisible().catch(() => false)) continue
    const current = clean(await sel.innerText().catch(() => ""))
    let options: string[] = []
    await sel.click().catch(() => undefined)
    await page.waitForTimeout(400)
    const optNodes = page.locator(".ant-select-dropdown:visible .ant-select-item-option, .ant-select-dropdown:visible li")
    const oc = Math.min(await optNodes.count().catch(() => 0), 20)
    for (let j = 0; j < oc; j += 1) {
      const t = clean(await optNodes.nth(j).innerText().catch(() => ""))
      if (t) options.push(t)
    }
    await page.keyboard.press("Escape").catch(() => undefined)
    await page.waitForTimeout(200)
    selectDump.push({ current, options })
  }

  const labels: string[] = []
  const labelNodes = dialog.locator("label, .ant-checkbox-wrapper, .ant-radio-wrapper")
  const lc = Math.min(await labelNodes.count().catch(() => 0), 30)
  for (let i = 0; i < lc; i += 1) {
    if (!await labelNodes.nth(i).isVisible().catch(() => false)) continue
    const t = clean(await labelNodes.nth(i).innerText().catch(() => ""))
    if (t) labels.push(t)
  }

  const buttons: string[] = []
  const btnNodes = dialog.locator("button, a, .ant-btn, [role='button']")
  const bc = Math.min(await btnNodes.count().catch(() => 0), 30)
  for (let i = 0; i < bc; i += 1) {
    if (!await btnNodes.nth(i).isVisible().catch(() => false)) continue
    const t = clean(await btnNodes.nth(i).innerText().catch(() => ""))
    if (t) buttons.push(t)
  }

  const inputs: Array<{ ph: string; val: string; type: string }> = []
  const inpNodes = dialog.locator("input")
  const ic = Math.min(await inpNodes.count().catch(() => 0), 20)
  for (let i = 0; i < ic; i += 1) {
    const inp = inpNodes.nth(i)
    if (!await inp.isVisible().catch(() => false)) continue
    inputs.push({
      ph: clean(await inp.getAttribute("placeholder").catch(() => "")),
      val: clean(await inp.inputValue().catch(() => "")),
      type: (await inp.getAttribute("type").catch(() => "")) ?? ""
    })
  }

  return {
    selects: selectDump,
    checkboxLabels: Array.from(new Set(labels)),
    buttons: Array.from(new Set(buttons)),
    inputs,
    textExcerpt: clean(await dialog.innerText().catch(() => "")).slice(0, 900)
  }
}

const closeAnyDialog = async (page: Page) => {
  const close = await firstVisible([
    page.locator(".ant-modal:visible .ant-modal-close"),
    page.locator(".ant-modal:visible").getByText(/取消|关闭|返回/).first()
  ])
  if (close) { await close.click().catch(() => undefined); await page.waitForTimeout(600) }
  else { await page.keyboard.press("Escape").catch(() => undefined); await page.waitForTimeout(400) }
}

const main = async () => {
  const targetUrl = getArgValue("url") ?? DEFAULT_URL
  const profileDir = path.resolve(getArgValue("profile") ?? ".runtime/playwright/dianxiaomi-profile")
  const selectorConfig = loadSelectorConfig(getArgValue("selector-config") ?? ".runtime/dianxiaomi-selector-config.json")
  const artifactDir = path.resolve(getArgValue("artifact-dir") ?? `.runtime/probe-carousel-media-tools-${new Date().toISOString().replace(/[:.]/g, "-")}`)
  await mkdir(artifactDir, { recursive: true })

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: "chromium", headless: true, viewport: { width: 1440, height: 960 }
  })
  try {
    const page = context.pages().find((p) => !p.isClosed()) ?? await context.newPage()
    page.setDefaultTimeout(20_000)
    if (page.url() !== targetUrl) await page.goto(targetUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined)
    await waitForManualLoginIfNeeded(page)
    await waitForPublishPage(page, selectorConfig, { targetUrl })
    await inspectDianxiaomiTargetSurface(page, selectorConfig)
    await page.waitForTimeout(3_000)

    // Scroll the carousel (产品轮播图) into view so its options button mounts.
    await page.evaluate(() => {
      const node = Array.from(document.querySelectorAll("*")).find((n) => /产品轮播图/.test((n as HTMLElement).innerText?.slice(0, 20) ?? ""))
      node?.scrollIntoView({ block: "center" })
    }).catch(() => undefined)
    await page.waitForTimeout(1_000)

    // Enumerate EVERY dropdown trigger inside the carousel image module and dump
    // each one's menu items, so we find which trigger exposes 批量改图片尺寸 /
    // 批量编辑 (vs 添加水印). Read-only: open, read, Escape.
    const triggerDump: Array<{ triggerText: string; triggerClass: string; menuItems: string[] }> = []
    const triggers = page.locator(".img-module .ant-dropdown-trigger, .img-module [class*='dropdown-trigger' i], .img-module .img-options-action-btn, .img-module button, .img-module a")
    const tc = Math.min(await triggers.count().catch(() => 0), 25)
    const seenTexts = new Set<string>()
    for (let i = 0; i < tc; i += 1) {
      const trig = triggers.nth(i)
      if (!await trig.isVisible().catch(() => false)) continue
      const triggerText = clean(await trig.innerText().catch(() => ""))
      const triggerClass = (await trig.getAttribute("class").catch(() => "")) ?? ""
      if (!triggerText || seenTexts.has(triggerText) || triggerText.length > 16) continue
      // Skip 导出全部图片 — clicking it triggers a real export + leaves a modal open.
      if (/导出/.test(triggerText)) { seenTexts.add(triggerText); triggerDump.push({ triggerText, triggerClass: triggerClass.slice(0, 60), menuItems: ["(skipped: export)"] }); continue }
      seenTexts.add(triggerText)
      await trig.scrollIntoViewIfNeeded().catch(() => undefined)
      await trig.click().catch(() => undefined)
      await page.waitForTimeout(500)
      const menuItems: string[] = []
      const menu = page.locator(".ant-dropdown:visible li, .ant-dropdown-menu-item:visible, .ant-dropdown:visible .ant-dropdown-menu-title-content")
      const mc = Math.min(await menu.count().catch(() => 0), 20)
      for (let j = 0; j < mc; j += 1) { const t = clean(await menu.nth(j).innerText().catch(() => "")); if (t) menuItems.push(t) }
      await page.keyboard.press("Escape").catch(() => undefined)
      await page.waitForTimeout(300)
      triggerDump.push({ triggerText, triggerClass: triggerClass.slice(0, 60), menuItems: Array.from(new Set(menuItems)) })
    }

    // Open the "编辑图片" menu and click a specific tool item in the SAME open
    // session (re-querying the trigger toggles the menu shut), then dump the
    // dialog. Read-only: never clicks apply/生成/确定.
    const dumpToolByItem = async (itemText: string, dialogHint: RegExp) => {
      // Dismiss any leftover modal (e.g. an 导出图片 export dialog) so it can't
      // intercept the trigger click.
      for (let g = 0; g < 3; g += 1) {
        const stuck = page.locator(".ant-modal:visible").first()
        if (!(await stuck.isVisible().catch(() => false))) break
        await closeAnyDialog(page)
      }
      const trigger = page.locator(".img-module .ant-dropdown-trigger, .img-module button, .img-module a").filter({ hasText: /编辑图片/ }).first()
      if (!(await trigger.isVisible().catch(() => false))) return { error: "no 编辑图片 trigger" }
      await trigger.scrollIntoViewIfNeeded().catch(() => undefined)
      await trigger.click().catch(() => undefined)
      await page.waitForTimeout(900)
      await page.screenshot({ path: path.join(artifactDir, `menu-open-${itemText}.png`) }).catch(() => undefined)
      // The menu items are <li> under the visible ant-dropdown (same locator that
      // triggerDump read successfully). Match by exact item text. Broaden the
      // menu-root selectors since the dropdown class can vary.
      const item = page.locator(".ant-dropdown li, .ant-dropdown-menu li, ul.ant-dropdown-menu li, [class*='dropdown'] li").filter({ hasText: itemText }).first()
      const visible = await item.isVisible().catch(() => false)
      if (!visible) {
        // debug: what items are visible right now?
        const seen: string[] = []
        const all = page.locator(".ant-dropdown li, .ant-dropdown-menu li, [class*='dropdown'] li")
        const n = Math.min(await all.count().catch(() => 0), 20)
        for (let k = 0; k < n; k += 1) { if (!await all.nth(k).isVisible().catch(() => false)) continue; const t = clean(await all.nth(k).innerText().catch(() => "")); if (t) seen.push(t) }
        await page.keyboard.press("Escape").catch(() => undefined)
        return { error: `menu item ${itemText} not visible`, visibleItems: seen }
      }
      await item.click().catch(() => undefined)
      await page.waitForTimeout(2000)
      let dialog = page.locator(".ant-modal-content:visible").filter({ hasText: dialogHint }).first()
      if (!(await dialog.isVisible().catch(() => false))) dialog = page.locator(".ant-modal-content:visible").last()
      if (!(await dialog.isVisible().catch(() => false))) return { error: "dialog did not open" }
      const dump = await dumpDialog(dialog, page)
      await closeAnyDialog(page)
      return { dialog: dump }
    }

    const batchResize = await dumpToolByItem("批量改图片尺寸", /改图片尺寸|改大小|尺寸|小边|等比例/)
    // Also dump the batch-resize dialog AFTER switching mode to 自定义比例调整
    // (custom ratio) — that is the mode that can force a 1:1 output.
    let batchResizeCustomRatio: unknown = { error: "not attempted" }
    {
      for (let g = 0; g < 3; g += 1) { const stuck = page.locator(".ant-modal:visible").first(); if (!(await stuck.isVisible().catch(() => false))) break; await closeAnyDialog(page) }
      const trigger = page.locator(".img-module .ant-dropdown-trigger, .img-module button, .img-module a").filter({ hasText: /编辑图片/ }).first()
      if (await trigger.isVisible().catch(() => false)) {
        await trigger.click().catch(() => undefined)
        await page.waitForTimeout(900)
        const item = page.locator(".ant-dropdown li, .ant-dropdown-menu li, [class*='dropdown'] li").filter({ hasText: "批量改图片尺寸" }).first()
        if (await item.isVisible().catch(() => false)) {
          await item.click().catch(() => undefined)
          await page.waitForTimeout(1600)
          const dialog = page.locator(".ant-modal-content:visible").last()
          const modeSelect = dialog.locator(".ant-select").first()
          await modeSelect.click().catch(() => undefined)
          await page.waitForTimeout(400)
          const custom = page.locator(".ant-select-dropdown:visible .ant-select-item-option, .ant-select-dropdown:visible li").filter({ hasText: /自定义比例/ }).first()
          if (await custom.isVisible().catch(() => false)) {
            await custom.click().catch(() => undefined)
            await page.waitForTimeout(1200)
            await page.screenshot({ path: path.join(artifactDir, "batch-resize-custom-ratio.png") }).catch(() => undefined)
            const freshDialog = page.locator(".ant-modal-content:visible").last()
            // The custom-ratio row has a "保持原图比例" select — the ratio control
            // that should offer 1:1. Open it by its visible text and dump options +
            // screenshot the open dropdown.
            let ratioSelectOptions: string[] = []
            // Target the ratio select by its EXACT selection text 保持原图比例.
            // (The mode select shows 自定义比例调整 which also contains 比例, so a
            // substring filter would hit the wrong one.) Fall back to nth(2).
            const ratioSelect = freshDialog.locator(".ant-select").filter({
              has: page.locator(".ant-select-selection-item[title='保持原图比例']")
            }).first()
            const ratioTarget = (await ratioSelect.isVisible().catch(() => false))
              ? ratioSelect
              : freshDialog.locator(".ant-select").nth(2)
            if (await ratioTarget.isVisible().catch(() => false)) {
              await ratioTarget.click().catch(() => undefined)
              await page.waitForTimeout(600)
              await page.screenshot({ path: path.join(artifactDir, "ratio-dropdown-open.png") }).catch(() => undefined)
              const on = page.locator(".ant-select-dropdown:visible .ant-select-item-option, .ant-select-dropdown:visible li")
              const onc = Math.min(await on.count().catch(() => 0), 20)
              for (let o = 0; o < onc; o += 1) { const t = clean(await on.nth(o).innerText().catch(() => "")); if (t) ratioSelectOptions.push(t) }
              await page.keyboard.press("Escape").catch(() => undefined)
            }
            // Also dump every select and every dropdown option-label the dialog shows.
            const allSelects: Array<{ current: string; options: string[] }> = []
            const sels = freshDialog.locator(".ant-select")
            const nsel = Math.min(await sels.count().catch(() => 0), 6)
            for (let s = 0; s < nsel; s += 1) {
              const sel = sels.nth(s)
              if (!await sel.isVisible().catch(() => false)) continue
              const current = clean(await sel.innerText().catch(() => ""))
              await sel.click().catch(() => undefined)
              await page.waitForTimeout(450)
              const opts: string[] = []
              const on = page.locator(".ant-select-dropdown:visible .ant-select-item-option, .ant-select-dropdown:visible li")
              const onc = Math.min(await on.count().catch(() => 0), 20)
              for (let o = 0; o < onc; o += 1) { const t = clean(await on.nth(o).innerText().catch(() => "")); if (t) opts.push(t) }
              await page.keyboard.press("Escape").catch(() => undefined)
              await page.waitForTimeout(200)
              allSelects.push({ current, options: opts })
            }
            batchResizeCustomRatio = { ratioSelectOptions, allSelects, dialog: await dumpDialog(freshDialog, page) }
          } else {
            batchResizeCustomRatio = { error: "自定义比例 option not found" }
          }
          await closeAnyDialog(page)
        } else {
          batchResizeCustomRatio = { error: "menu item not visible for custom-ratio pass" }
        }
      }
    }
    const imageEditor = await dumpToolByItem("批量编辑", /编辑|裁剪|crop|美图|图片/)

    const payload = { createdAt: new Date().toISOString(), targetUrl, pageUrl: page.url(), triggerDump, batchResize, batchResizeCustomRatio, imageEditor }
    const jsonPath = path.join(artifactDir, "probe-carousel-media-tools.json")
    await writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8")
    console.log(jsonPath)
  } finally {
    await context.close().catch(() => undefined)
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.stack ?? e.message : String(e)); process.exitCode = 1 })
