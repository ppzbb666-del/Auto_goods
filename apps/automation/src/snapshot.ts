import { writeFileSync } from "node:fs"
import path from "node:path"
import { chromium, type Locator, type Page } from "playwright"
import { EDITABLE_SELECTOR, ensureDirectory, escapeRegExp, firstVisible, getOptions, waitForManualLoginIfNeeded } from "./common"
import { inspectDianxiaomiTargetSurface, targetSurfaceCanInspect } from "./adapters/dianxiaomi-adapter"
import { loadSelectorConfig } from "./selector-config"

const captureSnapshotArtifact = async (page: Page, screenshotDir: string, name: string) => {
  ensureDirectory(screenshotDir)
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const screenshotPath = path.join(screenshotDir, `${name}-${timestamp}.png`)
  const screenshotNotePath = path.join(screenshotDir, `${name}-${timestamp}.txt`)

  try {
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
      timeout: 10_000
    })
    return screenshotPath
  } catch (fullPageError) {
    const message = fullPageError instanceof Error ? fullPageError.message : String(fullPageError)
    console.warn(`full-page snapshot capture failed: ${message}`)
  }

  try {
    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
      animations: "disabled",
      caret: "hide",
      timeout: 5_000
    })
    return screenshotPath
  } catch (viewportError) {
    const message = viewportError instanceof Error ? viewportError.message : String(viewportError)
    writeFileSync(screenshotNotePath, [
      "Screenshot capture failed.",
      `target: ${screenshotPath}`,
      `reason: ${message}`
    ].join("\n"), "utf8")
    console.warn(`snapshot capture failed, wrote note: ${screenshotNotePath}`)
    return screenshotNotePath
  }
}

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

type ImageTypeKey = "mainImage" | "detailImage" | "skuImage"

type ImageTypeStatsSnapshot = {
  count: number
  minWidthPx: number
  minHeightPx: number
  maxWidthPx: number
  maxHeightPx: number
  unknownDimensionCount: number
  maxSizeMb?: number
  unknownSizeCount?: number
}

type ManualDocumentSnapshot = {
  present: boolean
  format?: string
  sizeMb?: number
  englishOnly?: boolean
}

type VideoSnapshot = {
  present: boolean
  aspectRatio?: string
  sizeMb?: number
  durationSeconds?: number
}

type SizeChartSnapshot = {
  required?: boolean
  present: boolean
  imageCount?: number
  format?: string
  sizeMb?: number
}

type FulfillmentSnapshot = {
  mode?: string
  warehouseName?: string
  leadTimeDays?: number
  valid?: boolean
}

type DianxiaomiSnapshot = {
  pageUrl: string
  pageTitle: string
  createdAt: string
  targetSurface?: Awaited<ReturnType<typeof inspectDianxiaomiTargetSurface>>
  descriptionPreview?: {
    ok: boolean
    mode: "module-preview"
    selectorHint?: string
    textPreview?: string
  }
  fields: FieldSnapshot[]
  buttons: ButtonSnapshot[]
  skuRows: SkuRowSnapshot[]
  variantCount?: number
  imageTypeStats?: Partial<Record<ImageTypeKey, ImageTypeStatsSnapshot>>
  manualDocument?: ManualDocumentSnapshot
  video?: VideoSnapshot
  sizeChart?: SizeChartSnapshot
  fulfillment?: FulfillmentSnapshot
  mediaActionSampling?: {
    enabled: boolean
    tools: Array<{
      id: string
      configKey: string
      status: "sampled" | "missing-tool" | "no-dialog" | "close-failed" | "failed" | "skipped" | "instant-action-blocked" | "instant-action-recognized"
      sampledButtonCount: number
      reason: string
      entryText?: string
      error?: string
    }>
  }
}

const MEDIA_SAMPLE_TOOLS = [
  {
    id: "image-translation",
    configKey: "imageTranslation",
    keywords: ["\u56fe\u7247\u7ffb\u8bd1", "\u7ffb\u8bd1\u56fe\u7247", "\u4e00\u952e\u7ffb\u8bd1", "image translation", "translate image", "translate"],
    instantActionKeywords: ["\u4e00\u952e\u7ffb\u8bd1"]
  },
  {
    id: "white-background",
    configKey: "whiteBackground",
    keywords: ["\u767d\u5e95", "white background", "remove background"],
    instantActionKeywords: []
  },
  {
    id: "image-editor",
    configKey: "imageEditor",
    keywords: ["\u7f8e\u56fe", "\u56fe\u7247\u7f16\u8f91", "image editor", "edit image"],
    instantActionKeywords: []
  },
  {
    id: "batch-resize",
    configKey: "batchResize",
    keywords: ["\u6279\u91cf\u6539\u5927\u5c0f", "\u56fe\u7247\u5927\u5c0f", "resize", "batch resize"],
    instantActionKeywords: []
  },
  {
    id: "image-management",
    configKey: "imageManagement",
    keywords: ["\u56fe\u7247\u7ba1\u7406", "\u56fe\u7247\u7a7a\u95f4", "\u56fe\u7247\u68c0\u6d4b", "\u68c0\u6d4b\u56fe\u7247", "image management", "image space", "image check"],
    instantActionKeywords: ["\u56fe\u7247\u68c0\u6d4b", "\u68c0\u6d4b\u56fe\u7247"]
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

const mediaEntryText = async (locator: Locator) =>
  locator.evaluate((element) => [
    element.textContent ?? "",
    element.getAttribute("title") ?? "",
    element.getAttribute("aria-label") ?? "",
    element instanceof HTMLInputElement ? element.value : ""
  ].join(" ").replace(/\s+/g, " ").trim().slice(0, 180)).catch(() => "")

const matchesAnyKeyword = (value: string, keywords: readonly string[] = []) => {
  const lowerValue = value.toLowerCase()
  return keywords.some((keyword) => lowerValue.includes(keyword.toLowerCase()))
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

      const entryText = await mediaEntryText(entry)
      if (matchesAnyKeyword(entryText, tool.instantActionKeywords)) {
        // P0-D: this tool is recognized as an instant action (e.g. 一键翻译, 图片检测)
        // — it does not open a closeable dialog. We still want to mark its entry
        // selector as executable in unattended-apply mode, so we record
        // `instant-action-recognized` instead of `instant-action-blocked`. The
        // adapter's instant-action branch is the actual apply path.
        results.push({
          id: tool.id,
          configKey: tool.configKey,
          status: "instant-action-recognized",
          sampledButtonCount: 0,
          reason: "media entry recognized as an instant action; apply path does not require a dialog",
          entryText
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
  const compactText = (value) => (value || "").replace(/\s+/g, " ").trim()
  const quoteXpath = (value) => {
    const parts = String(value).split("'")
    if (parts.length === 1) {
      return "'" + value + "'"
    }

    return "concat(" + parts.map((part) => "'" + part + "'").join(", \"'\", ") + ")"
  }

  const isVisibleElement = (element) => {
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.visibility !== "hidden"
      && style.display !== "none"
      && rect.width > 0
      && rect.height > 0
      && element.getClientRects().length > 0
  }

  const includesAny = (value, keywords) => keywords.some((keyword) => value.includes(keyword))

  const ownControlText = (element) =>
    compactText(element.textContent || element.value || element.getAttribute("aria-label") || element.getAttribute("title") || "")

  const fieldContainerForElement = (element) => {
    const preferred = element.closest(".ant-form-item, .el-form-item, .form-group, .form-item, label, tr, [role='row']")
    if (preferred) {
      return preferred
    }

    const broadPreferred = element.closest("[class*='field' i]")
    if (broadPreferred) {
      return broadPreferred
    }

    let current = element.parentElement
    for (let depth = 0; current && depth < 5; depth += 1) {
      const text = compactText(current.textContent)
      if (text && text.length <= 500) {
        return current
      }
      current = current.parentElement
    }

    return element.parentElement
  }

  const labelTextForElement = (element, container) => {
    const label = container?.querySelector?.("label, .ant-form-item-label, .el-form-item__label, [class*='label' i], th")
    const labelText = compactText(label?.textContent).replace(/^[*:\s]+|[*:\s]+$/g, "")
    if (labelText && labelText.length <= 80) {
      return labelText
    }

    const containerText = compactText(container?.textContent)
    const value = compactText(element.value || element.textContent || element.getAttribute("placeholder") || "")
    if (!containerText || containerText.length > 240) {
      return ""
    }

    if (value && containerText.includes(value)) {
      const beforeValue = compactText(containerText.slice(0, containerText.indexOf(value))).replace(/^[*:\s]+|[*:\s]+$/g, "")
      if (beforeValue && beforeValue.length <= 80) {
        return beforeValue
      }
    }

    return ""
  }

  const selectorHintForElement = (element) => {
    const tagName = element.tagName.toLowerCase()
    const id = element.getAttribute("id")
    const name = element.getAttribute("name")
    const placeholder = element.getAttribute("placeholder")
    const className = typeof element.className === "string" ? element.className.trim().split(/\s+/).slice(0, 2).join(".") : ""
    const ownText = ownControlText(element)

    if (id) {
      return tagName + "#" + id
    }
    if (name) {
      return tagName + '[name="' + name + '"]'
    }
    if (placeholder) {
      return tagName + '[placeholder="' + placeholder + '"]'
    }
    if (ownText && ["button", "a"].includes(tagName)) {
      return tagName + ":has-text(" + JSON.stringify(ownText.slice(0, 80)) + ")"
    }
    const container = fieldContainerForElement(element)
    const labelText = labelTextForElement(element, container)
    if (labelText && ["input", "textarea", "select"].includes(tagName)) {
      return "xpath=(//*[contains(normalize-space(.), " + quoteXpath(labelText) + ")]/ancestor::*[contains(@class,'ant-form-item') or contains(@class,'el-form-item') or contains(@class,'form-item') or self::label or self::tr or @role='row'][1]//" + tagName + ")[1]"
    }
    if (className) {
      return tagName + "." + className
    }

    return tagName
  }

  const elementContextText = (element) => {
    const chunks = []
    let current = element

    for (let depth = 0; current instanceof HTMLElement && depth < 8; depth += 1) {
      const className = typeof current.className === "string" ? current.className : ""
      chunks.push(current.id, className, current.getAttribute("aria-label"), current.getAttribute("title"))

      const text = compactText(current.textContent)
      const imageCount = current.querySelectorAll?.("img").length ?? 0
      const broadPageContainer = ["main", "body", "html"].includes(current.tagName.toLowerCase())
      if (text && text.length <= 900 && !broadPageContainer && !(depth > 1 && imageCount > 1)) {
        chunks.push(text)
      }

      let sibling = current.previousElementSibling
      for (let index = 0; sibling instanceof HTMLElement && index < 3; index += 1) {
        const siblingText = compactText(sibling.textContent)
        const siblingHasComplexContent = Boolean(sibling.querySelector?.("img, input, textarea, select, table"))
        if (siblingText && siblingText.length <= 180 && !siblingHasComplexContent) {
          chunks.push(siblingText)
        }
        sibling = sibling.previousElementSibling
      }

      current = current.parentElement
    }

    return compactText(chunks.filter(Boolean).join(" ")).slice(0, 3000)
  }

  const imageDimensions = (image) => {
    const rect = image.getBoundingClientRect()
    const width = image.naturalWidth || Number(image.getAttribute("width")) || Math.round(rect.width)
    const height = image.naturalHeight || Number(image.getAttribute("height")) || Math.round(rect.height)
    return {
      width: Number.isFinite(width) ? Math.max(0, Math.round(width)) : 0,
      height: Number.isFinite(height) ? Math.max(0, Math.round(height)) : 0
    }
  }

  const isProductImageElement = (image) => {
    if (!(image instanceof HTMLImageElement) || !isVisibleElement(image)) {
      return false
    }

    const src = image.currentSrc || image.src
    if (!src) {
      return false
    }

    const rect = image.getBoundingClientRect()
    const size = imageDimensions(image)
    const largestKnownSide = Math.max(size.width, size.height, rect.width, rect.height)
    const smallestKnownSide = Math.min(size.width || rect.width, size.height || rect.height)
    const context = elementContextText(image).toLowerCase()

    if (largestKnownSide < 80 || smallestKnownSide < 24) {
      return false
    }

    if (includesAny(context, ["logo", "头像", "客服", "反馈", "导航", "菜单", "\u89c6\u9891", "video", "\u5c3a\u7801\u8868", "size chart", "\u8bf4\u660e\u4e66", "manual"])) {
      return false
    }

    return true
  }

  const classifyImageType = (image) => {
    const context = elementContextText(image).toLowerCase()
    const row = image.closest("tr, [role='row']")
    const table = image.closest("table, [class*='table' i]")

    if (
      includesAny(context, ["sku图片", "sku image", "sku图", "变体图片", "变种图片", "规格图片"])
      || ((row || table) && includesAny(context, ["sku", "变种", "变体", "规格", "颜色", "尺码"]))
    ) {
      return "skuImage"
    }

    if (includesAny(context, ["产品描述", "商品描述", "详情描述", "图文详情", "产品详情", "详情图", "描述图片", "description", "details"])) {
      return "detailImage"
    }

    return "mainImage"
  }

  const extractMaxSizeMb = (text) => {
    const matches = Array.from(String(text).matchAll(/(\d+(?:\.\d+)?)\s*(mb|m|kb|k)\b/gi))
    const values = matches
      .map((match) => {
        const value = Number(match[1])
        if (!Number.isFinite(value)) {
          return undefined
        }
        return match[2].toLowerCase().startsWith("k") ? value / 1024 : value
      })
      .filter((value) => typeof value === "number")
    return values.length > 0 ? Number(Math.max(...values).toFixed(3)) : undefined
  }

  const aggregateImageStats = (images) => {
    const knownDimensions = images.map(imageDimensions).filter((size) => size.width > 0 && size.height > 0)
    const knownSizes = images
      .map((image) => extractMaxSizeMb(elementContextText(image)))
      .filter((value) => typeof value === "number")
    const dimensions = knownDimensions.length > 0
      ? {
          minWidthPx: Math.min(...knownDimensions.map((size) => size.width)),
          minHeightPx: Math.min(...knownDimensions.map((size) => size.height)),
          maxWidthPx: Math.max(...knownDimensions.map((size) => size.width)),
          maxHeightPx: Math.max(...knownDimensions.map((size) => size.height)),
          unknownDimensionCount: Math.max(0, images.length - knownDimensions.length)
        }
      : {
          minWidthPx: 0,
          minHeightPx: 0,
          maxWidthPx: 0,
          maxHeightPx: 0,
          unknownDimensionCount: images.length
        }

    return {
      count: images.length,
      ...dimensions,
      ...(knownSizes.length > 0
        ? {
            maxSizeMb: Number(Math.max(...knownSizes).toFixed(3)),
            unknownSizeCount: Math.max(0, images.length - knownSizes.length)
          }
        : {})
    }
  }

  const uniqueElements = (elements) => Array.from(new Set(elements.filter(Boolean)))

  const firstVisibleElement = (elements) => elements.find((element) => element instanceof HTMLElement && isVisibleElement(element)) || null

  const metadataContainerText = (element) => compactText([
    element?.textContent || "",
    element?.getAttribute?.("aria-label") || "",
    element?.getAttribute?.("title") || ""
  ].join(" "))

  const METADATA_CONTAINER_SELECTOR = [
    "section",
    "article",
    "fieldset",
    "li",
    "td",
    "tr",
    "[role='group']",
    "[role='region']",
    "[class*='form-item' i]",
    "[class*='upload' i]",
    "[class*='video' i]",
    "[class*='file' i]",
    "[class*='item' i]",
    "[class*='panel' i]"
  ].join(", ")

  const keywordContainerCandidates = (keywords) => {
    const lowerKeywords = keywords.map((keyword) => keyword.toLowerCase())
    return uniqueElements(
      Array.from(document.querySelectorAll(METADATA_CONTAINER_SELECTOR + ", div"))
        .filter((element) => element instanceof HTMLElement && isVisibleElement(element))
        .filter((element) => {
          const text = metadataContainerText(element).toLowerCase()
          return text.length > 0 && text.length <= 2000 && lowerKeywords.some((keyword) => text.includes(keyword))
        })
    )
      .map((element) => {
        const text = metadataContainerText(element)
        const lowerText = text.toLowerCase()
        const keywordCount = lowerKeywords.filter((keyword) => lowerText.includes(keyword)).length
        const buttonCount = element?.querySelectorAll?.("button, a, [role='button'], [role='menuitem'], input[type='button'], input[type='submit']").length ?? 0
        const mediaCount = element?.querySelectorAll?.("img, video, canvas").length ?? 0
        const nestedContainerCount = element?.querySelectorAll?.(METADATA_CONTAINER_SELECTOR).length ?? 0
        const fileSignalCount = Array.from(lowerText.matchAll(/\b[\w-]+\.(?:pdf|docx?|mp4|mov|avi|mkv|webm|jpg|jpeg|png)\b/g)).length
        const semanticBonus = element?.matches?.("section, article, fieldset")
          ? 12
          : element?.matches?.("[role='group'], [role='region'], [class*='form-item' i], [class*='upload' i], [class*='video' i], [class*='file' i], [class*='item' i], [class*='panel' i]")
            ? 8
            : element?.tagName?.toLowerCase?.() === "div"
              ? 0
              : 4
        return {
          element,
          text,
          score: keywordCount * 14
            + semanticBonus
            + Math.min(buttonCount, 4)
            + Math.min(mediaCount, 3)
            + Math.min(fileSignalCount * 6, 12)
            - Math.floor(text.length / 80)
            - Math.min(nestedContainerCount, 10) * 4
        }
      })
      .filter((candidate) => candidate.element)
      .sort((left, right) => right.score - left.score || left.text.length - right.text.length)
  }

  const bestKeywordContainer = (keywords) => {
    const candidate = keywordContainerCandidates(keywords)[0]
    return candidate?.element || null
  }

  const extractFileName = (text, extensions) => {
    const match = compactText(text).match(new RegExp("\\S+\\.(" + extensions.join("|") + ")", "i"))
    return match?.[0] || ""
  }

  const extractFileExtension = (fileName) => {
    const match = String(fileName || "").match(/\.([a-z0-9]+)$/i)
    return match?.[1]?.toLowerCase()
  }

  const extractFileSizeForName = (text, fileName) => {
    if (!fileName) {
      return undefined
    }

    const start = String(text).toLowerCase().indexOf(String(fileName).toLowerCase())
    const snippet = start >= 0 ? text.slice(start, start + 160) : text
    return extractMaxSizeMb(snippet)
  }

  const hasActionKeyword = (text, keywords) => includesAny(String(text).toLowerCase(), keywords.map((keyword) => keyword.toLowerCase()))

  const aspectRatioFromDimensions = (width, height) => {
    const safeWidth = Math.round(width)
    const safeHeight = Math.round(height)
    if (!(safeWidth > 0 && safeHeight > 0)) {
      return undefined
    }

    const gcd = (left, right) => {
      let a = Math.abs(left)
      let b = Math.abs(right)
      while (b !== 0) {
        const next = a % b
        a = b
        b = next
      }
      return a || 1
    }

    const divisor = gcd(safeWidth, safeHeight)
    return safeWidth / divisor + ":" + safeHeight / divisor
  }

  const aspectRatioFromElement = (element) => {
    if (!(element instanceof HTMLElement)) {
      return undefined
    }

    if (element instanceof HTMLImageElement) {
      const size = imageDimensions(element)
      return aspectRatioFromDimensions(size.width, size.height)
    }

    if (element instanceof HTMLVideoElement) {
      return aspectRatioFromDimensions(element.videoWidth || element.clientWidth, element.videoHeight || element.clientHeight)
    }

    if (element instanceof HTMLCanvasElement) {
      return aspectRatioFromDimensions(element.width || element.clientWidth, element.height || element.clientHeight)
    }

    const rect = element.getBoundingClientRect()
    return aspectRatioFromDimensions(rect.width, rect.height)
  }

  const inferFulfillmentMode = () => {
    const text = compactText([metadata.pageTitle, metadata.pageUrl, document.body?.innerText || ""].join(" ")).toLowerCase()
    if (includesAny(text, ["temu local", "\u672c\u571f"])) {
      return "local"
    }
    if (includesAny(text, ["\u534a\u6258\u7ba1", "semi-managed"])) {
      return "semi-managed"
    }
    if (includesAny(text, ["\u5168\u6258\u7ba1", "full managed", "full-managed"])) {
      return "full-managed"
    }
    return undefined
  }

  const collectManualDocument = () => {
    const candidates = keywordContainerCandidates([
      "\u8bf4\u660e\u4e66",
      "\u4e0a\u4f20\u6587\u4ef6",
      "manual",
      "pdf"
    ])
    if (candidates.length === 0) {
      return undefined
    }

    const matchedCandidate = candidates.find(({ text }) => extractFileName(text, ["pdf", "doc", "docx"]))
      || candidates[0]
    const text = matchedCandidate.text
    const fileName = extractFileName(text, ["pdf", "doc", "docx"])
    const format = extractFileExtension(fileName)
    const present = Boolean(fileName)
    const sizeMb = extractFileSizeForName(text, fileName)

    return {
      present,
      ...(format ? { format } : {}),
      ...(present && typeof sizeMb === "number"
        ? { sizeMb }
        : {})
    }
  }

  const collectVideoMetadata = () => {
    const candidates = keywordContainerCandidates([
      "\u89c6\u9891",
      "\u6dfb\u52a0\u89c6\u9891",
      "\u56fe\u7247\u751f\u6210\u89c6\u9891",
      "video"
    ])
    if (candidates.length === 0) {
      return undefined
    }

    const isVideoPreviewElement = (candidateElement) => {
      if (candidateElement instanceof HTMLImageElement) {
        const size = imageDimensions(candidateElement)
        return size.width >= 40 && size.height >= 40
      }

      if (candidateElement instanceof HTMLVideoElement) {
        return (candidateElement.videoWidth || candidateElement.clientWidth) >= 40
          && (candidateElement.videoHeight || candidateElement.clientHeight) >= 40
      }

      if (candidateElement instanceof HTMLCanvasElement) {
        return (candidateElement.width || candidateElement.clientWidth) >= 40
          && (candidateElement.height || candidateElement.clientHeight) >= 40
      }

      const rect = candidateElement.getBoundingClientRect()
      return rect.width >= 40 && rect.height >= 40
    }

    const previewMediaFor = (element) => {
      let current = element
      for (let depth = 0; current instanceof HTMLElement && depth < 4; depth += 1) {
        const previewMedia = firstVisibleElement(
          Array.from(current.querySelectorAll("video, img, canvas"))
            .filter(isVideoPreviewElement)
        )
        if (previewMedia) {
          return previewMedia
        }
        current = current.parentElement
      }
      return null
    }
    const matchedCandidate = candidates.find(({ element }) => Boolean(previewMediaFor(element)))
      || candidates.find(({ element, text }) => Boolean(extractFileName(text, ["mp4", "mov", "avi", "mkv", "webm"])) && Boolean(previewMediaFor(element)))
      || candidates.find(({ text }) => Boolean(extractFileName(text, ["mp4", "mov", "avi", "mkv", "webm"])))
      || candidates.find(({ text }) => hasActionKeyword(text, ["\u64ad\u653e", "\u5220\u9664", "\u91cd\u65b0\u4e0a\u4f20", "play", "delete", "reupload"]))
      || candidates[0]
    const text = matchedCandidate.text
    const previewMedia = previewMediaFor(matchedCandidate.element)
    const fileName = extractFileName(text, ["mp4", "mov", "avi", "mkv", "webm"])
    const present = Boolean(previewMedia)
      || Boolean(fileName)
      || hasActionKeyword(text, ["\u64ad\u653e", "\u5220\u9664", "\u91cd\u65b0\u4e0a\u4f20", "play", "delete", "reupload"])
    const sizeMb = extractFileSizeForName(text, fileName)

    return {
      present,
      ...(previewMedia ? { aspectRatio: aspectRatioFromElement(previewMedia) } : {}),
      ...(fileName && typeof sizeMb === "number"
        ? { sizeMb }
        : {})
    }
  }

  const collectSizeChartMetadata = () => {
    const candidates = keywordContainerCandidates([
      "\u5c3a\u7801\u8868",
      "size chart"
    ])
    if (candidates.length === 0) {
      return undefined
    }

    const matchedCandidate = candidates.find(({ element, text }) => {
      const fileName = extractFileName(text, ["jpg", "jpeg", "png"])
      const images = Array.from(element.querySelectorAll("img"))
        .filter((image) => image instanceof HTMLImageElement && isVisibleElement(image))
      return Boolean(fileName) || images.length > 0
    }) || candidates[0]
    const text = matchedCandidate.text
    const images = Array.from(matchedCandidate.element.querySelectorAll("img"))
      .filter((image) => image instanceof HTMLImageElement && isVisibleElement(image))
    const fileName = extractFileName(text, ["jpg", "jpeg", "png"])
    const format = extractFileExtension(fileName)
      || extractFileExtension(images[0]?.getAttribute?.("src") || images[0]?.currentSrc || "")
    const present = images.length > 0 || Boolean(fileName) || hasActionKeyword(text, ["\u5220\u9664", "\u91cd\u65b0\u4e0a\u4f20", "delete", "reupload"])
    const sizeMb = extractFileSizeForName(text, fileName)

    return {
      required: true,
      present,
      ...(present ? { imageCount: Math.max(images.length, fileName ? 1 : 0) } : {}),
      ...(format ? { format } : {}),
      ...(fileName && typeof sizeMb === "number"
        ? { sizeMb }
        : {})
    }
  }

const collectFulfillmentMetadata = () => {
    const mode = inferFulfillmentMode()
    const candidates = keywordContainerCandidates([
      "\u4ed3\u5e93",
      "\u53d1\u8d27\u4ed3",
      "\u5907\u8d27",
      "\u4ea4\u671f",
      "warehouse",
      "lead time"
    ])
    const matchedCandidate = candidates.find(({ text }) =>
      /(?:\u4ed3\u5e93|\u53d1\u8d27\u4ed3|warehouse)/i.test(text)
      || /(?:\u5907\u8d27(?:\u65f6\u95f4|\u5929\u6570|\u5468\u671f)?|\u4ea4\u671f|lead time)/i.test(text)
    ) || candidates[0]
    const text = matchedCandidate?.text || ""
    const warehouseMatch = text.match(/(?:\u4ed3\u5e93|\u53d1\u8d27\u4ed3|warehouse)[:?]?\s*([\s\S]{1,80}?)(?=(?:\u5907\u8d27(?:\u65f6\u95f4|\u5929\u6570|\u5468\u671f)?|\u4ea4\u671f|lead time|$))/i)
    const leadTimeMatch = text.match(/(?:\u5907\u8d27(?:\u65f6\u95f4|\u5929\u6570|\u5468\u671f)?|\u4ea4\u671f|lead time)[^\d]{0,8}(\d{1,3})/i)

    if (!mode && !warehouseMatch?.[1] && !leadTimeMatch?.[1]) {
      return undefined
    }

    return {
      ...(mode ? { mode } : {}),
      ...(warehouseMatch?.[1] ? { warehouseName: compactText(warehouseMatch[1]).slice(0, 80) } : {}),
      ...(leadTimeMatch?.[1] ? { leadTimeDays: Number(leadTimeMatch[1]) } : {})
    }
  }

  const collectImageTypeStats = () => {
    const grouped = {
      mainImage: [],
      detailImage: [],
      skuImage: []
    }

    Array.from(document.querySelectorAll("img"))
      .filter(isProductImageElement)
      .slice(0, 120)
      .forEach((image) => grouped[classifyImageType(image)].push(image))

    return Object.fromEntries(
      Object.entries(grouped)
        .filter(([, images]) => images.length > 0)
        .map(([imageType, images]) => [imageType, aggregateImageStats(images)])
    )
  }

  const editableElements = Array.from(document.querySelectorAll(metadata.editableSelector)).filter(isVisibleElement)
  const interactiveElements = Array.from(document.querySelectorAll("button, a, [role='button'], [role='menuitem'], input[type='button'], input[type='submit']")).filter(isVisibleElement)
  const allSkuRowElements = Array.from(document.querySelectorAll("tr, [role='row'], [class*='sku' i], [class*='table-row' i], [class*='row' i]"))
    .filter((element) => {
      if (!(element instanceof HTMLElement)) {
        return false
      }

      if (!element.querySelector(metadata.editableSelector)) {
        return false
      }

      const text = compactText(element.textContent).toLowerCase()
      const hasVariationSku = Boolean(element.querySelector("input[name='variationSku'], [class*='skuAttrCode' i]"))
      const hasPrice = Boolean(element.querySelector("input[name='price'], input[placeholder*='price' i], input[placeholder*='\u4ef7'], input[name*='price' i]"))
      const hasStock = Boolean(element.querySelector("input[name='stock'], input[placeholder*='stock' i], input[placeholder*='\u5e93\u5b58'], input[name*='stock' i]"))
      return hasVariationSku || hasPrice || hasStock || includesAny(text, ["sku", "\u989c\u8272", "\u5c3a\u7801", "\u89c4\u683c"])
    })
  const manualDocument = collectManualDocument()
  const video = collectVideoMetadata()
  const sizeChart = collectSizeChartMetadata()
  const fulfillment = collectFulfillmentMetadata()
  const descriptionPreview = (() => {
    const preview = document.querySelector("#describeInfo #wirelessDescContentBox, #describeInfo .wireless-description-box, #describeInfo .details-box-all")
    if (!preview || !isVisibleElement(preview)) {
      return {
        ok: false,
        mode: "module-preview"
      }
    }

    return {
      ok: true,
      mode: "module-preview",
      selectorHint: selectorHintForElement(preview),
      textPreview: compactText(preview.textContent).slice(0, 180)
    }
  })()

  return {
    pageUrl: metadata.pageUrl,
    pageTitle: metadata.pageTitle,
    createdAt: new Date().toISOString(),
    descriptionPreview,
    ...(allSkuRowElements.length > 0 ? { variantCount: allSkuRowElements.length } : {}),
    fields: editableElements.slice(0, 320).map((element) => {
      const input = element
      const container = fieldContainerForElement(element)

      return {
        tagName: element.tagName.toLowerCase(),
        type: input.getAttribute("type") ?? "",
        name: input.getAttribute("name") ?? "",
        placeholder: input.getAttribute("placeholder") ?? "",
        ariaLabel: input.getAttribute("aria-label") ?? "",
        valuePreview: "value" in input ? String(input.value ?? "").slice(0, 80) : "",
        labelText: labelTextForElement(element, container),
        selectorHint: selectorHintForElement(element),
        nearbyText: compactText(container?.textContent).slice(0, 220)
      }
    }),
    buttons: interactiveElements.slice(0, 360).map((element) => {
      const input = element
      const container = element.closest("label, li, tr, [role='row'], [class*='menu' i], [class*='button' i], [class*='tool' i], [class*='item' i]") ?? element.parentElement
      const dialog = element.closest("[role='dialog'], [aria-modal='true'], .modal, .ant-modal, .el-dialog, [class*='modal' i], [class*='dialog' i]")

      return {
        text: ownControlText(element).slice(0, 80),
        type: input.getAttribute("type") ?? "",
        ariaLabel: input.getAttribute("aria-label") ?? "",
        title: input.getAttribute("title") ?? "",
        selectorHint: selectorHintForElement(element),
        nearbyText: compactText(container?.textContent).slice(0, 180),
        dialogSelectorHint: dialog ? selectorHintForElement(dialog) : "",
        dialogLabel: dialog ? compactText(dialog.getAttribute("aria-label") || dialog.getAttribute("title") || "").slice(0, 120) : "",
        dialogText: dialog ? compactText(dialog.textContent).slice(0, 360) : ""
      }
    }),
    skuRows: allSkuRowElements
      .slice(0, 40)
      .map((element) => ({
        rowText: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 240),
        inputCount: element.querySelectorAll(metadata.editableSelector).length
      })),
    imageTypeStats: collectImageTypeStats(),
    ...(manualDocument ? { manualDocument } : {}),
    ...(video ? { video } : {}),
    ...(sizeChart ? { sizeChart } : {}),
    ...(fulfillment ? { fulfillment } : {})
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
    const screenshotPath = await captureSnapshotArtifact(page, options.screenshotDir, "dianxiaomi-snapshot")

    writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2), "utf8")

    console.log(`已保存页面快照：${jsonPath}`)
    console.log(`已保存页面截图：${screenshotPath}`)
  } finally {
    if (!options.headed || !options.keepOpen) {
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
