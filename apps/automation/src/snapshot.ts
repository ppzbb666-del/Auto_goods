import { writeFileSync } from "node:fs"
import path from "node:path"
import { chromium, type Locator, type Page } from "playwright"
import { EDITABLE_SELECTOR, ensureDirectory, escapeRegExp, firstVisible, getOptions, waitForManualLoginIfNeeded } from "./common"
import { inspectDianxiaomiTargetSurface, targetSurfaceCanInspect } from "./adapters/dianxiaomi-adapter"
import { loadSelectorConfig } from "./selector-config"

type FieldSnapshot = {
  tagName: string
  type: string
  name: string
  placeholder: string
  ariaLabel: string
  valuePreview: string
  selectorHint: string
  nearbyText: string
}

type ButtonSnapshot = {
  text: string
  type: string
  ariaLabel?: string
  title?: string
  selectorHint: string
  nearbyText?: string
  dialogSelectorHint?: string
  dialogLabel?: string
  dialogText?: string
}

type SkuRowSnapshot = {
  rowText: string
  inputCount: number
}

type DianxiaomiSnapshot = {
  pageUrl: string
  pageTitle: string
  createdAt: string
  targetSurface?: Awaited<ReturnType<typeof inspectDianxiaomiTargetSurface>>
  fields: FieldSnapshot[]
  buttons: ButtonSnapshot[]
  skuRows: SkuRowSnapshot[]
  mediaActionSampling?: {
    enabled: boolean
    tools: Array<{
      id: string
      configKey: string
      status: "sampled" | "missing-tool" | "no-dialog" | "close-failed" | "failed" | "skipped"
      sampledButtonCount: number
      reason: string
      error?: string
    }>
  }
}

const MEDIA_SAMPLE_TOOLS = [
  {
    id: "image-translation",
    configKey: "imageTranslation",
    keywords: ["\u56fe\u7247\u7ffb\u8bd1", "image translation", "translate image", "translate"]
  },
  {
    id: "white-background",
    configKey: "whiteBackground",
    keywords: ["\u767d\u5e95", "white background", "remove background"]
  },
  {
    id: "image-editor",
    configKey: "imageEditor",
    keywords: ["\u7f8e\u56fe", "\u56fe\u7247\u7f16\u8f91", "image editor", "edit image"]
  },
  {
    id: "batch-resize",
    configKey: "batchResize",
    keywords: ["\u6279\u91cf\u6539\u5927\u5c0f", "\u56fe\u7247\u5927\u5c0f", "resize", "batch resize"]
  },
  {
    id: "image-management",
    configKey: "imageManagement",
    keywords: ["\u56fe\u7247\u7ba1\u7406", "\u56fe\u7247\u7a7a\u95f4", "image management", "image space"]
  }
] as const

type MediaSampleTool = typeof MEDIA_SAMPLE_TOOLS[number]
type MediaActionSamplingResult = NonNullable<DianxiaomiSnapshot["mediaActionSampling"]>

const BLOCKING_DIALOG_SELECTOR = [
  "[role='dialog']",
  "[aria-modal='true']",
  ".modal",
  ".ant-modal",
  ".el-dialog",
  "[class*='modal']",
  "[class*='dialog']"
].join(", ")

const MEDIA_CLOSE_KEYWORDS = ["close", "done", "finish", "completed", "back", "return", "cancel", "\u5173\u95ed", "\u8fd4\u56de", "\u53d6\u6d88"]

const visibleDialogLocators = async (page: Page) => {
  const dialogs = page.locator(BLOCKING_DIALOG_SELECTOR)
  const count = Math.min(await dialogs.count().catch(() => 0), 20)
  const visible: Locator[] = []
  for (let index = 0; index < count; index += 1) {
    const dialog = dialogs.nth(index)
    if (await dialog.isVisible().catch(() => false)) {
      visible.push(dialog)
    }
  }
  return visible
}

const closeLatestDialogIfOpen = async (page: Page) => {
  const dialogs = await visibleDialogLocators(page)
  const dialog = dialogs[dialogs.length - 1]
  if (!dialog) {
    return true
  }

  const closeCandidates = MEDIA_CLOSE_KEYWORDS.map((keyword) => dialog.getByRole("button", { name: new RegExp(escapeRegExp(keyword), "i") }))
  const closeButton = await firstVisible(closeCandidates)
    ?? await firstVisible([
      dialog.locator("[aria-label*='close' i]"),
      dialog.locator("[title*='close' i]"),
      dialog.locator(".ant-modal-close, .el-dialog__headerbtn, .modal-close, [class*='close' i]")
    ])
  if (!closeButton) {
    return false
  }

  await closeButton.click().catch(() => undefined)
  await page.waitForTimeout(500)
  return (await visibleDialogLocators(page)).length < dialogs.length
}

const findMediaEntry = async (page: Page, tool: MediaSampleTool, configuredSelectors: string[]) => {
  const configured = configuredSelectors.length > 0
    ? await firstVisible(configuredSelectors.map((selector) => page.locator(selector)))
    : null
  if (configured) {
    return configured
  }

  const keywordLocators = tool.keywords.flatMap((keyword) => [
    page.getByRole("button", { name: new RegExp(escapeRegExp(keyword), "i") }),
    page.getByRole("link", { name: new RegExp(escapeRegExp(keyword), "i") }),
    page.locator("button, a, [role='button'], [role='menuitem'], [class*='tool' i], [class*='item' i]").filter({
      hasText: new RegExp(escapeRegExp(keyword), "i")
    })
  ])
  return firstVisible(keywordLocators)
}

const sampleMediaActions = async (
  page: Page,
  configuredMediaTools: ReturnType<typeof loadSelectorConfig>["mediaTools"] = {},
  allowTools: string[]
) => {
  const allowSet = new Set(allowTools.map((item) => item.trim()).filter(Boolean))
  const tools = MEDIA_SAMPLE_TOOLS.filter((tool) => allowSet.size === 0 || allowSet.has(tool.id) || allowSet.has(tool.configKey))
  const results: MediaActionSamplingResult["tools"] = []

  for (const tool of tools) {
    try {
      const entry = await findMediaEntry(page, tool, configuredMediaTools?.[tool.configKey] ?? [])
      if (!entry) {
        results.push({
          id: tool.id,
          configKey: tool.configKey,
          status: "missing-tool",
          sampledButtonCount: 0,
          reason: "media tool entry not found"
        })
        continue
      }

      await entry.scrollIntoViewIfNeeded().catch(() => undefined)
      await entry.click()
      await page.waitForTimeout(800)
      const dialogs = await visibleDialogLocators(page)
      const dialog = dialogs[dialogs.length - 1]
      if (!dialog) {
        results.push({
          id: tool.id,
          configKey: tool.configKey,
          status: "no-dialog",
          sampledButtonCount: 0,
          reason: "media entry clicked but no dialog opened"
        })
        continue
      }

      const buttonCount = Math.min(await dialog.locator("button, a, [role='button'], [role='menuitem'], input[type='button'], input[type='submit']").count().catch(() => 0), 60)
      const closed = await closeLatestDialogIfOpen(page)
      results.push({
        id: tool.id,
        configKey: tool.configKey,
        status: closed ? "sampled" : "close-failed",
        sampledButtonCount: buttonCount,
        reason: closed ? "dialog sampled and closed" : "dialog sampled but close action was not confirmed"
      })
    } catch (error) {
      results.push({
        id: tool.id,
        configKey: tool.configKey,
        status: "failed",
        sampledButtonCount: 0,
        reason: "media action sampling failed",
        error: error instanceof Error ? error.message : String(error)
      })
      await closeLatestDialogIfOpen(page).catch(() => undefined)
    }
  }

  for (const tool of MEDIA_SAMPLE_TOOLS) {
    if (!tools.some((sampled) => sampled.id === tool.id)) {
      results.push({
        id: tool.id,
        configKey: tool.configKey,
        status: "skipped",
        sampledButtonCount: 0,
        reason: "not included in sampling allowlist"
      })
    }
  }

  return results
}

const collectSnapshot = new Function("metadata", String.raw`
  const selectorHintForElement = (element) => {
    const tagName = element.tagName.toLowerCase()
    const id = element.getAttribute("id")
    const name = element.getAttribute("name")
    const placeholder = element.getAttribute("placeholder")
    const className = typeof element.className === "string" ? element.className.trim().split(/\s+/).slice(0, 2).join(".") : ""

    if (id) {
      return tagName + "#" + id
    }
    if (name) {
      return tagName + '[name="' + name + '"]'
    }
    if (placeholder) {
      return tagName + '[placeholder="' + placeholder + '"]'
    }
    if (className) {
      return tagName + "." + className
    }
    const ownText = (element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || "").replace(/\s+/g, " ").trim()
    if (ownText && ["button", "a"].includes(tagName)) {
      return tagName + ":has-text(" + JSON.stringify(ownText.slice(0, 80)) + ")"
    }

    return tagName
  }

  return {
    pageUrl: metadata.pageUrl,
    pageTitle: metadata.pageTitle,
    createdAt: new Date().toISOString(),
    fields: Array.from(document.querySelectorAll(metadata.editableSelector)).slice(0, 120).map((element) => {
      const input = element
      const container = element.closest("label, tr, [role='row'], [class*='form' i], [class*='field' i], [class*='item' i]") ?? element.parentElement

      return {
        tagName: element.tagName.toLowerCase(),
        type: input.getAttribute("type") ?? "",
        name: input.getAttribute("name") ?? "",
        placeholder: input.getAttribute("placeholder") ?? "",
        ariaLabel: input.getAttribute("aria-label") ?? "",
        valuePreview: "value" in input ? String(input.value ?? "").slice(0, 80) : "",
        selectorHint: selectorHintForElement(element),
        nearbyText: (container?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 180)
      }
    }),
    buttons: Array.from(document.querySelectorAll("button, a, [role='button'], [role='menuitem'], input[type='button'], input[type='submit']")).slice(0, 160).map((element) => {
      const input = element
      const container = element.closest("label, li, tr, [role='row'], [class*='menu' i], [class*='button' i], [class*='tool' i], [class*='item' i]") ?? element.parentElement
      const dialog = element.closest("[role='dialog'], [aria-modal='true'], .modal, .ant-modal, .el-dialog, [class*='modal' i], [class*='dialog' i]")

      return {
        text: ((element.textContent || input.value || element.getAttribute("aria-label") || "") ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
        type: input.getAttribute("type") ?? "",
        ariaLabel: input.getAttribute("aria-label") ?? "",
        title: input.getAttribute("title") ?? "",
        selectorHint: selectorHintForElement(element),
        nearbyText: (container?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 180),
        dialogSelectorHint: dialog ? selectorHintForElement(dialog) : "",
        dialogLabel: dialog ? ((dialog.getAttribute("aria-label") || dialog.getAttribute("title") || "") ?? "").replace(/\s+/g, " ").trim().slice(0, 120) : "",
        dialogText: dialog ? (dialog.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 360) : ""
      }
    }),
    skuRows: Array.from(document.querySelectorAll("tr, [role='row'], [class*='sku' i], [class*='table-row' i], [class*='row' i]"))
      .filter((element) => element.querySelector(metadata.editableSelector))
      .slice(0, 40)
      .map((element) => ({
        rowText: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 240),
        inputCount: element.querySelectorAll(metadata.editableSelector).length
      }))
  }
`) as (metadata: { pageUrl: string; pageTitle: string; editableSelector: string }) => DianxiaomiSnapshot

const main = async () => {
  const options = getOptions()
  ensureDirectory(options.profileDir)
  ensureDirectory(options.screenshotDir)

  const context = await chromium.launchPersistentContext(options.profileDir, {
    headless: !options.headed,
    slowMo: options.slowMo,
    viewport: {
      width: 1440,
      height: 960
    }
  })

  const page = await context.newPage()
  page.setDefaultTimeout(15_000)

  try {
    console.log(`打开页面：${options.targetUrl}`)
    await page.goto(options.targetUrl, {
      waitUntil: "domcontentloaded"
    })
    await waitForManualLoginIfNeeded(page)
    const selectorConfig = loadSelectorConfig(options.selectorConfig)
    let targetSurface = await inspectDianxiaomiTargetSurface(page, selectorConfig)

    console.log("请进入店小秘产品编辑/刊登页。脚本会等待页面出现可编辑表单后采集快照。")
    await page.waitForFunction(
      (selector) => document.querySelectorAll(selector).length >= 3,
      EDITABLE_SELECTOR,
      {
        timeout: targetSurfaceCanInspect(targetSurface) || options.headed ? 10 * 60 * 1000 : 1
      }
    ).catch(() => undefined)
    targetSurface = await inspectDianxiaomiTargetSurface(page, selectorConfig)

    let mediaActionSampling: DianxiaomiSnapshot["mediaActionSampling"] | undefined
    if (options.sampleMediaActions) {
      mediaActionSampling = {
        enabled: true,
        tools: await sampleMediaActions(page, selectorConfig.mediaTools, options.mediaAutomationTools)
      }
    }

    const snapshot = await page.evaluate(collectSnapshot, {
      pageUrl: page.url(),
      pageTitle: await page.title(),
      editableSelector: EDITABLE_SELECTOR
    })
    snapshot.targetSurface = targetSurface
    snapshot.mediaActionSampling = mediaActionSampling
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const jsonPath = path.join(options.screenshotDir, `dianxiaomi-snapshot-${timestamp}.json`)
    const screenshotPath = path.join(options.screenshotDir, `dianxiaomi-snapshot-${timestamp}.png`)

    writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2), "utf8")
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    })

    console.log(`已保存页面快照：${jsonPath}`)
    console.log(`已保存页面截图：${screenshotPath}`)
  } finally {
    if (!options.headed) {
      await context.close()
    } else {
      console.log("headed 模式下浏览器保持打开，确认完成后可手动关闭。")
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
