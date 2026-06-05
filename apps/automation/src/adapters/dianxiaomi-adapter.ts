import type { Locator, Page } from "playwright"
import path from "node:path"
import type { DianxiaomiProductRepairAction, DianxiaomiProductRepairPlan, ListingDraft, ListingSkuPricing } from "@temu-ai-ops/shared"
import { EDITABLE_SELECTOR, escapeRegExp, firstVisible, normalizeText, type RunnerOptions } from "../common"
import { findByConfiguredSelectors, loadSelectorConfig, type DianxiaomiSelectorConfig } from "../selector-config"

export type FieldKind = "title" | "description" | "price" | "stock" | "attribute"

export type StepStatus = "done" | "failed" | "skipped"

export type AutomationStepResult = {
  id: string
  label: string
  status: StepStatus
  detail: string
  data?: Record<string, unknown>
}

type MediaToolDefinition = {
  id: string
  configKey: "imageTranslation" | "whiteBackground" | "imageEditor" | "batchResize" | "imageManagement"
  label: string
  keywords: string[]
}

type LocatorDescriptor = {
  tagName: string
  text: string
  role: string | null
  className: string
  href: string
}

type MediaToolCandidate = {
  id: string
  configKey: MediaToolDefinition["configKey"]
  label: string
  keywords: string[]
  selectorConfigured: boolean
  locator: Locator | null
  locatorDescriptor: LocatorDescriptor | null
}

type MediaToolSafetyStatus =
  | "manual-confirmation-required"
  | "ready-for-unattended-open"
  | "ready-for-unattended-apply"
  | "missing-tool"
  | "blocked-by-open-dialog"
  | "blocked-by-media-failure"
  | "opened"
  | "applied"
  | "open-failed"
  | "apply-failed"
  | "return-failed"

type FeedbackState = "success" | "failure" | "unknown"
type MediaSurfaceState = "matched" | "missing" | "mismatched"
type MediaFailureKind =
  | "transient"
  | "invalid-media"
  | "missing-input"
  | "unsupported"
  | "surface-mismatch"
  | "surface-missing"
  | "apply-control-missing"
  | "return-blocked"
  | "unknown"

type MediaToolSafetyItem = {
  id: string
  configKey: MediaToolDefinition["configKey"]
  label: string
  available: boolean
  selectorConfigured: boolean
  status: MediaToolSafetyStatus
  reason: string
  requiresManualConfirmation: boolean
  wouldClick: boolean
  wouldApply: boolean
  clicked?: boolean
  applied?: boolean
  beforeUrl?: string
  afterUrl?: string
  beforeDialogCount?: number
  afterDialogCount?: number
  returnDialogCount?: number
  screenshotPath?: string | null
  beforeApplyScreenshotPath?: string | null
  afterApplyScreenshotPath?: string | null
  surfaceState?: MediaSurfaceState
  surfaceMatchedKeyword?: string | null
  surfaceText?: string
  applyButton?: LocatorDescriptor | null
  feedbackState?: FeedbackState
  feedbackMessage?: string
  feedbackSource?: string
  feedbackAttempts?: MediaApplyAttemptFeedback[]
  applyAttempts?: number
  maxApplyAttempts?: number
  failureKind?: MediaFailureKind
  retryable?: boolean
  error?: string | null
  locator: LocatorDescriptor | null
}

type PageSafetyState = {
  visibleDialogCount: number
  visibleImageCount: number
  blockingDialogs: LocatorDescriptor[]
}

type SubmitFeedback = {
  state: FeedbackState
  message: string
  source: string
}

type MediaApplyFeedback = {
  state: FeedbackState
  message: string
  source: string
}

type MediaApplyAttemptFeedback = MediaApplyFeedback & {
  attempt: number
  failureKind?: MediaFailureKind
  retryable?: boolean
}

type MediaSurfaceInspection = {
  state: MediaSurfaceState
  matchedKeyword: string | null
  text: string
}

type SubmitAttemptResult = SubmitFeedback & {
  attempt: number
  clickedSubmit: boolean
  clickedConfirm: boolean
  feedbackChanged: boolean
}

type MediaProcessingSafetyPlan = {
  safeMode: "plan-only" | "unattended-open" | "unattended-apply"
  wouldClick: boolean
  wouldApply: boolean
  guardStatus: "manual-ready" | "blocked" | "no-tools"
  manualConfirmationRequired: boolean
  pageState: PageSafetyState
  tools: MediaToolSafetyItem[]
}

type TargetSurfaceStatus = "real-dianxiaomi" | "fixture" | "missing-fields" | "login-or-captcha" | "unknown"

type TargetSurfaceInspection = {
  pageUrl: string
  pageTitle: string
  host: string
  isDianxiaomiHost: boolean
  isDataFixture: boolean
  loginOrCaptchaDetected: boolean
  surfaceStatus: TargetSurfaceStatus
  canWrite: boolean
  canInspect: boolean
  reasons: string[]
  fieldReadiness: {
    title: number
    description: number
    skuRows: number
    price: number
    stock: number
    saveButton: number
    submitButton: number
    mediaTools: number
    editableFields: number
  }
}

const stepResult = (
  id: string,
  label: string,
  status: StepStatus,
  detail: string,
  data?: Record<string, unknown>
): AutomationStepResult => ({
  id,
  label,
  status,
  detail,
  data
})

const COMMON_FIELD_KEYWORDS: Record<FieldKind, string[]> = {
  title: ["商品标题", "产品标题", "标题", "product title", "title", "name"],
  description: ["商品描述", "产品描述", "详情描述", "描述", "description", "details"],
  price: ["申报价", "售价", "销售价", "价格", "price", "sale price", "retail price"],
  stock: ["库存", "数量", "可售库存", "stock", "quantity", "available"],
  attribute: ["属性", "规格", "变体", "attribute", "variation", "specification"]
}

const DIANXIAOMI_FIELD_KEYWORDS: Record<FieldKind, string[]> = {
  title: ["商品标题", "产品标题", "刊登标题", "平台标题", "标题", "title"],
  description: ["商品描述", "产品描述", "刊登描述", "详情描述", "描述", "description"],
  price: ["申报价", "建议售价", "刊登价", "销售价", "售价", "价格", "price"],
  stock: ["库存", "刊登库存", "可售库存", "数量", "stock", "quantity"],
  attribute: ["产品属性", "商品属性", "平台属性", "规格", "变种", "变体", "attribute"]
}

const ATTRIBUTE_ALIASES: Record<string, string[]> = {
  color: ["颜色", "色", "color"],
  size: ["尺码", "尺寸", "规格", "size"],
  material: ["材质", "material"],
  power: ["功率", "供电", "电源", "power"],
  usage: ["用途", "使用场景", "usage"]
}

export const getFieldKeywords = (kind: FieldKind) => [
  ...(kind === "title" ? ["\u5546\u54c1\u6807\u9898", "\u4ea7\u54c1\u6807\u9898", "\u520a\u767b\u6807\u9898", "\u5e73\u53f0\u6807\u9898", "\u6807\u9898"] : []),
  ...(kind === "description" ? ["\u5546\u54c1\u63cf\u8ff0", "\u4ea7\u54c1\u63cf\u8ff0", "\u520a\u767b\u63cf\u8ff0", "\u8be6\u60c5\u63cf\u8ff0", "\u63cf\u8ff0"] : []),
  ...(kind === "price" ? ["\u7533\u62a5\u4ef7", "\u5efa\u8bae\u552e\u4ef7", "\u520a\u767b\u4ef7", "\u9500\u552e\u4ef7", "\u552e\u4ef7", "\u4ef7\u683c"] : []),
  ...(kind === "stock" ? ["\u5e93\u5b58", "\u520a\u767b\u5e93\u5b58", "\u53ef\u552e\u5e93\u5b58", "\u6570\u91cf"] : []),
  ...(kind === "attribute" ? ["\u4ea7\u54c1\u5c5e\u6027", "\u5546\u54c1\u5c5e\u6027", "\u5e73\u53f0\u5c5e\u6027", "\u5c5e\u6027", "\u89c4\u683c", "\u53d8\u79cd", "\u53d8\u4f53"] : []),
  ...DIANXIAOMI_FIELD_KEYWORDS[kind],
  ...COMMON_FIELD_KEYWORDS[kind]
]

const INTERNAL_DIANXIAOMI_ATTRIBUTE_KEYS = new Set([
  "dianxiaomiWorkItemId",
  "dianxiaomiPageUrl",
  "dianxiaomiRequirementPreset",
  "dianxiaomiCollectedProductId"
])

const isInternalDianxiaomiAttributeKey = (key: string) =>
  INTERNAL_DIANXIAOMI_ATTRIBUTE_KEYS.has(key) || key.startsWith("dxm-")

const DIANXIAOMI_MEDIA_TOOLS: MediaToolDefinition[] = [
  {
    id: "image-translation",
    configKey: "imageTranslation",
    label: "Image translation",
    keywords: ["图片翻译", "翻译图片", "image translation", "translate image", "translate"]
  },
  {
    id: "white-background",
    configKey: "whiteBackground",
    label: "White background",
    keywords: ["图片白底", "白底图", "白底", "white background", "remove background"]
  },
  {
    id: "image-editor",
    configKey: "imageEditor",
    label: "Xiaomi image editor",
    keywords: ["小秘美图", "美图", "图片编辑", "image editor", "edit image"]
  },
  {
    id: "batch-resize",
    configKey: "batchResize",
    label: "Batch resize",
    keywords: ["批量改大小", "改大小", "图片大小", "resize", "batch resize"]
  },
  {
    id: "image-management",
    configKey: "imageManagement",
    label: "Image management",
    keywords: ["图片管理", "图片空间", "image management", "image space"]
  }
]

const BLOCKING_DIALOG_SELECTOR = [
  "[role='dialog']",
  "[aria-modal='true']",
  ".modal",
  ".ant-modal",
  ".el-dialog",
  "[class*='modal']",
  "[class*='dialog']"
].join(", ")

const MEDIA_APPLY_KEYWORDS: Record<MediaToolDefinition["id"], string[]> = {
  "image-translation": [
    "apply translation",
    "start translation",
    "translate now",
    "translate",
    "confirm",
    "apply",
    "save"
  ],
  "white-background": [
    "apply white background",
    "make white background",
    "remove background",
    "confirm",
    "apply",
    "save"
  ],
  "image-editor": [
    "apply edit",
    "save image",
    "finish editing",
    "complete",
    "confirm",
    "apply",
    "save"
  ],
  "batch-resize": [
    "apply resize",
    "resize now",
    "batch resize",
    "confirm",
    "apply",
    "save"
  ],
  "image-management": [
    "apply selection",
    "confirm selection",
    "use selected",
    "confirm",
    "apply",
    "save"
  ]
}

const MEDIA_CLOSE_KEYWORDS = [
  "close",
  "done",
  "finish",
  "completed",
  "back",
  "return",
  "cancel"
]

const SAVE_BUTTON_KEYWORDS = [
  "\u4fdd\u5b58\u8349\u7a3f",
  "\u4fdd\u5b58",
  "\u6682\u5b58",
  "save draft",
  "save",
  "娣囨繂鐡ㄩ懡澶岊焾",
  "娣囨繂鐡?",
  "閺嗗倸鐡?"
]

const SUBMIT_BUTTON_KEYWORDS = [
  "\u53d1\u5e03",
  "\u63d0\u4ea4",
  "\u7acb\u5373\u520a\u767b",
  "\u520a\u767b",
  "submit",
  "publish",
  "閸欐垵绔?",
  "閹绘劒姘?",
  "缁斿宓嗛崚濠勬"
]

const LOGIN_OR_CAPTCHA_KEYWORDS = [
  "\u767b\u5f55",
  "\u8bf7\u767b\u5f55",
  "\u9a8c\u8bc1\u7801",
  "\u4eba\u673a\u9a8c\u8bc1",
  "login",
  "sign in",
  "captcha",
  "verify"
]

const PUBLISH_SURFACE_HINTS = [
  "\u6807\u9898",
  "\u4ef7\u683c",
  "\u552e\u4ef7",
  "\u5e93\u5b58",
  "\u5546\u54c1",
  "\u520a\u767b",
  "title",
  "price",
  "stock",
  "sku",
  "product",
  "publish"
]

const countVisible = async (locator: Locator, maxCount = 80) => {
  const count = Math.min(await locator.count().catch(() => 0), maxCount)
  let visibleCount = 0

  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) {
      visibleCount += 1
    }
  }

  return visibleCount
}

const safeArtifactName = (value: string) => value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()

export const findFieldByKeyword = async (page: Page, keywords: string[]) => {
  const uniqueKeywords = Array.from(new Set(keywords))
  const selectorLocators = uniqueKeywords.flatMap((keyword) => [
    page.getByLabel(keyword, { exact: false }),
    page.getByPlaceholder(keyword, { exact: false }),
    page.locator(`input[name*="${keyword}" i], textarea[name*="${keyword}" i]`),
    page.locator(`input[aria-label*="${keyword}" i], textarea[aria-label*="${keyword}" i]`)
  ])

  const directMatch = await firstVisible(selectorLocators)
  if (directMatch) {
    return directMatch
  }

  const labelNodes = page.locator("label, span, div, p, strong").filter({
    hasText: new RegExp(uniqueKeywords.map(escapeRegExp).join("|"), "i")
  })

  const labelCount = Math.min(await labelNodes.count(), 40)
  for (let index = 0; index < labelCount; index += 1) {
    const node = labelNodes.nth(index)
    const containers = [
      node.locator("xpath=ancestor-or-self::label[1]"),
      node.locator("xpath=ancestor::*[contains(translate(@class,'FORMFIELDITEMROW','formfielditemrow'),'form')][1]"),
      node.locator("xpath=ancestor::*[contains(translate(@class,'FORMFIELDITEMROW','formfielditemrow'),'field')][1]"),
      node.locator("xpath=..")
    ]

    for (const container of containers) {
      const field = await firstVisible([container.locator(EDITABLE_SELECTOR)])
      if (field) {
        return field
      }
    }
  }

  return null
}

const findField = async (page: Page, kind: FieldKind, config?: DianxiaomiSelectorConfig) => {
  const configured = await findByConfiguredSelectors(page, config?.fields?.[kind])
  if (configured) {
    return configured
  }

  return findFieldByKeyword(page, getFieldKeywords(kind))
}

const fillTextField = async (field: Locator, value: string) => {
  await field.scrollIntoViewIfNeeded()
  const tagName = await field.evaluate((element) => element.tagName.toLowerCase())
  const isContentEditable = await field.evaluate((element) => element.getAttribute("contenteditable") === "true")

  if (isContentEditable) {
    await field.click()
    await field.press(process.platform === "darwin" ? "Meta+A" : "Control+A")
    await field.type(value)
    return
  }

  if (tagName === "input" || tagName === "textarea") {
    await field.fill(value)
    return
  }

  await field.click()
  await field.type(value)
}

export const fillSingleField = async (page: Page, kind: FieldKind, value: string, config?: DianxiaomiSelectorConfig) => {
  const field = await findField(page, kind, config)
  if (!field) {
    console.warn(`未找到字段：${kind}`)
    return stepResult(`fill-${kind}`, `填写 ${kind}`, "failed", `未找到字段：${kind}`)
  }

  await fillTextField(field, value)
  console.log(`已填写字段：${kind}`)
  return stepResult(`fill-${kind}`, `填写 ${kind}`, "done", `已填写字段：${kind}`)
}

export const findSkuRows = async (page: Page, config?: DianxiaomiSelectorConfig) => {
  const configuredRow = config?.skuRows?.length
    ? page.locator(config.skuRows.join(", ")).filter({
        has: page.locator(EDITABLE_SELECTOR)
      })
    : null
  const rowCandidates = page.locator("tr, [role='row'], [class*='sku' i], [class*='table-row' i], [class*='row' i]").filter({
    has: page.locator(EDITABLE_SELECTOR)
  })

  const rows: Array<{ row: Locator; text: string }> = []
  const candidates = configuredRow && await configuredRow.count() > 0 ? configuredRow : rowCandidates
  const count = Math.min(await candidates.count(), 80)
  for (let index = 0; index < count; index += 1) {
    const row = candidates.nth(index)
    const text = normalizeText(await row.innerText().catch(() => ""))
    const inputs = await row.locator(EDITABLE_SELECTOR).count()

    if (inputs > 0) {
      rows.push({
        row,
        text
      })
    }
  }

  return rows
}

const scoreSkuRow = (rowText: string, sku: ListingSkuPricing) => {
  const tokens = [sku.skuName, sku.attributeSummary, ...Object.values(sku.attributes)]
    .map(normalizeText)
    .filter(Boolean)

  return tokens.reduce((score, token) => score + (rowText.includes(token) ? Math.max(token.length, 1) : 0), 0)
}

const getRowField = async (row: Locator, kind: "price" | "stock", fallbackIndex: number) => {
  const keywords = getFieldKeywords(kind)
  const byHint = row.locator(
    keywords
      .flatMap((keyword) => [
        `input[placeholder*="${keyword}" i]`,
        `input[aria-label*="${keyword}" i]`,
        `input[name*="${keyword}" i]`,
        `textarea[placeholder*="${keyword}" i]`,
        `textarea[aria-label*="${keyword}" i]`,
        `textarea[name*="${keyword}" i]`
      ])
      .join(", ")
  )

  const hinted = await firstVisible([byHint])
  if (hinted) {
    return hinted
  }

  const inputs = row.locator(EDITABLE_SELECTOR)
  if ((await inputs.count()) > fallbackIndex) {
    return inputs.nth(fallbackIndex)
  }

  return null
}

export const fillSkuPricing = async (page: Page, skus: ListingSkuPricing[], config?: DianxiaomiSelectorConfig) => {
  const rows = await findSkuRows(page, config)
  const usedRows = new Set<number>()
  let filledPrices = 0
  let filledStocks = 0

  for (const [skuIndex, sku] of skus.entries()) {
    let selectedIndex = -1
    let bestScore = -1

    rows.forEach((row, rowIndex) => {
      if (usedRows.has(rowIndex)) {
        return
      }

      const score = scoreSkuRow(row.text, sku)
      if (score > bestScore) {
        selectedIndex = rowIndex
        bestScore = score
      }
    })

    if (selectedIndex < 0 && rows[skuIndex]) {
      selectedIndex = skuIndex
    }

    const selectedRow = rows[selectedIndex]
    if (!selectedRow) {
      continue
    }

    usedRows.add(selectedIndex)
    const priceField = await getRowField(selectedRow.row, "price", 0)
    const stockField = await getRowField(selectedRow.row, "stock", 1)

    if (priceField) {
      await fillTextField(priceField, sku.salePriceUsd.toFixed(2))
      filledPrices += 1
    }

    if (stockField) {
      await fillTextField(stockField, String(sku.stock))
      filledStocks += 1
    }
  }

  if (filledPrices === 0 && skus[0]) {
    await fillSingleField(page, "price", skus[0].salePriceUsd.toFixed(2), config)
  }

  if (filledStocks === 0 && skus[0]) {
    await fillSingleField(page, "stock", String(skus[0].stock), config)
  }

  console.log(`SKU 填写完成：价格 ${filledPrices} 项，库存 ${filledStocks} 项`)
  return stepResult(
    "fill-sku-pricing",
    "填写 SKU 价格和库存",
    filledPrices > 0 || filledStocks > 0 ? "done" : "failed",
    `SKU 填写完成：价格 ${filledPrices} 项，库存 ${filledStocks} 项`,
    {
      skuCount: skus.length,
      detectedRows: rows.length,
      filledPrices,
      filledStocks
    }
  )
}

export const fillAttributes = async (page: Page, draft: ListingDraft, config?: DianxiaomiSelectorConfig) => {
  let successCount = 0
  const missedKeys: string[] = []
  const writableEntries = Object.entries(draft.attributes).filter(([key]) => !isInternalDianxiaomiAttributeKey(key))

  for (const [key, value] of writableEntries) {
    const keywords = ATTRIBUTE_ALIASES[key] ?? [key]
    const field = await findByConfiguredSelectors(page, config?.fields?.attribute) ?? await findFieldByKeyword(page, keywords)

    if (!field) {
      console.warn(`未找到属性字段：${key}`)
      missedKeys.push(key)
      continue
    }

    await fillTextField(field, value)
    successCount += 1
  }

  console.log(`属性填写完成：${successCount}/${writableEntries.length}`)
  return stepResult(
    "fill-attributes",
    "填写属性",
    successCount > 0 || writableEntries.length === 0 ? "done" : "failed",
    `属性填写完成：${successCount}/${writableEntries.length}`,
    {
      successCount,
      totalCount: writableEntries.length,
      missedKeys
    }
  )
}

const visibleFlag = async (locator: Locator | null) =>
  locator && await locator.isVisible().catch(() => false) ? 1 : 0

const getCurrentHost = (pageUrl: string) => {
  try {
    return new URL(pageUrl).hostname.toLowerCase()
  } catch {
    return ""
  }
}

const isDianxiaomiHost = (host: string) => /(^|\.)dianxiaomi\.(com|cn)$/i.test(host)

export const inspectDianxiaomiTargetSurface = async (
  page: Page,
  config: DianxiaomiSelectorConfig = {}
) => {
  const pageUrl = page.url()
  const pageTitle = await page.title().catch(() => "")
  const host = getCurrentHost(pageUrl)
  const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""))
  const titleField = await findField(page, "title", config)
  const descriptionField = await findField(page, "description", config)
  const rows = await findSkuRows(page, config)
  const priceField = rows.length > 0 ? null : await findField(page, "price", config)
  const stockField = rows.length > 0 ? null : await findField(page, "stock", config)
  const saveButton = await findButtonByKeywords(page, SAVE_BUTTON_KEYWORDS, config.buttons?.save)
  const submitButton = await findButtonByKeywords(page, SUBMIT_BUTTON_KEYWORDS, config.buttons?.submit)
  const mediaToolCount = (await collectMediaToolCandidates(page, config)).filter((tool) => tool.locator).length
  const fieldReadiness: TargetSurfaceInspection["fieldReadiness"] = {
    title: await visibleFlag(titleField),
    description: await visibleFlag(descriptionField),
    skuRows: rows.length,
    price: await visibleFlag(priceField),
    stock: await visibleFlag(stockField),
    saveButton: await visibleFlag(saveButton),
    submitButton: await visibleFlag(submitButton),
    mediaTools: mediaToolCount,
    editableFields: await countVisible(page.locator(EDITABLE_SELECTOR), 200)
  }
  const hostMatchesDianxiaomi = isDianxiaomiHost(host)
  const dataFixture = pageUrl.startsWith("data:") && pageTitle.includes("Dianxiaomi Dry Run Fixture")
  const loginOrCaptchaDetected = LOGIN_OR_CAPTCHA_KEYWORDS.some((keyword) =>
    bodyText.includes(keyword.toLowerCase()) || pageTitle.toLowerCase().includes(keyword.toLowerCase())
  )
  const hasTitleOrDescription = fieldReadiness.title > 0 || fieldReadiness.description > 0
  const hasPricingSurface = fieldReadiness.skuRows > 0 || (fieldReadiness.price > 0 && fieldReadiness.stock > 0)
  const hasActionOrMediaSignal = fieldReadiness.saveButton > 0 || fieldReadiness.submitButton > 0 || fieldReadiness.mediaTools > 0
  const hasEnoughEditableFields = fieldReadiness.editableFields >= 3
  const formReady = hasTitleOrDescription && hasPricingSurface && hasActionOrMediaSignal && hasEnoughEditableFields
  const canInspect = !loginOrCaptchaDetected && formReady && (hostMatchesDianxiaomi || dataFixture)
  const canWrite = canInspect
  const reasons = [
    hostMatchesDianxiaomi ? "host is Dianxiaomi" : `host is not Dianxiaomi: ${host || "none"}`,
    dataFixture ? "local dry-run fixture detected" : "not the local dry-run fixture",
    formReady ? "listing edit surface signals are present" : "listing edit surface signals are incomplete",
    loginOrCaptchaDetected ? "login or captcha text detected" : "no login/captcha text detected"
  ]
  const surfaceStatus: TargetSurfaceStatus = loginOrCaptchaDetected
    ? "login-or-captcha"
    : dataFixture && formReady
      ? "fixture"
      : hostMatchesDianxiaomi && formReady
        ? "real-dianxiaomi"
        : hostMatchesDianxiaomi || pageUrl.startsWith("data:")
          ? "missing-fields"
          : "unknown"
  const inspection: TargetSurfaceInspection = {
    pageUrl,
    pageTitle,
    host,
    isDianxiaomiHost: hostMatchesDianxiaomi,
    isDataFixture: dataFixture,
    loginOrCaptchaDetected,
    surfaceStatus,
    canWrite,
    canInspect,
    reasons,
    fieldReadiness
  }

  return stepResult(
    "target-surface",
    "Target surface",
    canInspect ? "done" : "failed",
    canInspect
      ? `Current page is recognized as ${surfaceStatus}; automation may inspect and write.`
      : `Current page is not a safe Dianxiaomi listing edit surface: ${surfaceStatus}.`,
    inspection as unknown as Record<string, unknown>
  )
}

export const targetSurfaceCanWrite = (step: AutomationStepResult) =>
  step.id === "target-surface" && (step.data as TargetSurfaceInspection | undefined)?.canWrite === true

export const targetSurfaceCanInspect = (step: AutomationStepResult) =>
  step.id === "target-surface" && (step.data as TargetSurfaceInspection | undefined)?.canInspect === true

export const hasPublishSurface = async (page: Page) => {
  const config = loadSelectorConfig(".runtime/dianxiaomi-selector-config.json")
  const targetSurface = await inspectDianxiaomiTargetSurface(page, config)
  return targetSurfaceCanInspect(targetSurface)
}

export const waitForPublishPage = async (
  page: Page,
  _config: DianxiaomiSelectorConfig = loadSelectorConfig(".runtime/dianxiaomi-selector-config.json"),
  options: { waitForManualNavigation?: boolean } = {}
) => {
  if (await hasPublishSurface(page)) {
    return
  }

  if (options.waitForManualNavigation === false) {
    return
  }

  console.log("当前还不是店小秘产品编辑/刊登表单。请在打开的浏览器中进入对应商品的编辑或刊登页，脚本会自动继续。")
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText?.toLowerCase() ?? ""
      const editableCount = document.querySelectorAll("input:not([type='hidden']):not([disabled]), textarea:not([disabled]), [contenteditable='true']").length
      return editableCount >= 3 && ["标题", "价格", "库存", "sku", "刊登", "商品"].some((keyword) => text.includes(keyword))
    },
    undefined,
    {
      timeout: 10 * 60 * 1000
    }
  )
}

export const clickByKeywords = async (page: Page, keywords: string[], selectors?: string[]) => {
  const configured = await findByConfiguredSelectors(page, selectors)
  if (configured) {
    await configured.click()
    return true
  }

  for (const keyword of keywords) {
    const button = page.getByRole("button", {
      name: new RegExp(escapeRegExp(keyword), "i")
    })

    if (await button.first().isVisible().catch(() => false)) {
      await button.first().click()
      return true
    }
  }

  return false
}

const findButtonByKeywords = async (page: Page, keywords: string[], selectors?: string[]) => {
  const configured = await findByConfiguredSelectors(page, selectors)
  if (configured) {
    return configured
  }

  for (const keyword of keywords) {
    const button = page.getByRole("button", {
      name: new RegExp(escapeRegExp(keyword), "i")
    })

    if (await button.first().isVisible().catch(() => false)) {
      return button.first()
    }
  }

  return null
}

const findInteractiveByKeywords = async (page: Page, keywords: string[], selectors?: string[]) => {
  const configured = await findByConfiguredSelectors(page, selectors)
  if (configured) {
    return configured
  }

  for (const keyword of keywords) {
    const pattern = new RegExp(escapeRegExp(keyword), "i")
    const match = await firstVisible([
      page.getByRole("button", { name: pattern }),
      page.getByRole("link", { name: pattern }),
      page.getByRole("menuitem", { name: pattern }),
      page.locator("button, a, [role='button'], [role='menuitem'], input[type='button']").filter({ hasText: pattern }),
      page.locator("label, span, div").filter({ hasText: pattern })
    ])

    if (match) {
      return match
    }
  }

  return null
}

const describeLocator = async (locator: Locator | null): Promise<LocatorDescriptor | null> => {
  if (!locator) {
    return null
  }

  return locator.evaluate((element) => ({
    tagName: element.tagName.toLowerCase(),
    text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
    role: element.getAttribute("role"),
    className: typeof element.className === "string" ? element.className.slice(0, 120) : "",
    href: element instanceof HTMLAnchorElement ? element.href : ""
  })).catch(() => null)
}

const collectMediaToolCandidates = async (
  page: Page,
  config: DianxiaomiSelectorConfig = {}
): Promise<MediaToolCandidate[]> => {
  const candidates: MediaToolCandidate[] = []

  for (const tool of DIANXIAOMI_MEDIA_TOOLS) {
    const configuredSelectors = config.mediaTools?.[tool.configKey] ?? []
    const locator = await findInteractiveByKeywords(page, tool.keywords, configuredSelectors)
    const locatorDescriptor = await describeLocator(locator)
    candidates.push({
      ...tool,
      selectorConfigured: configuredSelectors.length > 0,
      locator,
      locatorDescriptor
    })
  }

  return candidates
}

const getPageSafetyState = async (page: Page): Promise<PageSafetyState> => {
  const dialogs = page.locator(BLOCKING_DIALOG_SELECTOR)
  const dialogCount = Math.min(await dialogs.count().catch(() => 0), 20)
  const blockingDialogs: LocatorDescriptor[] = []

  for (let index = 0; index < dialogCount; index += 1) {
    const dialog = dialogs.nth(index)
    if (await dialog.isVisible().catch(() => false)) {
      const descriptor = await describeLocator(dialog)
      if (descriptor) {
        blockingDialogs.push(descriptor)
      }
    }
  }

  return {
    visibleDialogCount: blockingDialogs.length,
    visibleImageCount: await countVisible(page.locator("img"), 120),
    blockingDialogs
  }
}

const visibleDialogLocators = async (page: Page) => {
  const dialogs = page.locator(BLOCKING_DIALOG_SELECTOR)
  const dialogCount = Math.min(await dialogs.count().catch(() => 0), 20)
  const visibleDialogs: Locator[] = []

  for (let index = 0; index < dialogCount; index += 1) {
    const dialog = dialogs.nth(index)
    if (await dialog.isVisible().catch(() => false)) {
      visibleDialogs.push(dialog)
    }
  }

  return visibleDialogs
}

const getLatestMediaSurface = async (page: Page) => {
  const dialogs = await visibleDialogLocators(page)
  return dialogs[dialogs.length - 1] ?? page.locator("body")
}

const getLatestMediaDialog = async (page: Page) => {
  const dialogs = await visibleDialogLocators(page)
  return dialogs[dialogs.length - 1] ?? null
}

const findInteractiveInRootByKeywords = async (root: Page | Locator, keywords: string[]) => {
  for (const keyword of keywords) {
    const pattern = new RegExp(escapeRegExp(keyword), "i")
    const valueSelector = [
      `input[type='button'][value*="${keyword}" i]`,
      `input[type='submit'][value*="${keyword}" i]`,
      `[aria-label*="${keyword}" i]`,
      `[title*="${keyword}" i]`
    ].join(", ")
    const match = await firstVisible([
      root.getByRole("button", { name: pattern }),
      root.getByRole("link", { name: pattern }),
      root.getByRole("menuitem", { name: pattern }),
      root.locator("button, a, [role='button'], [role='menuitem']").filter({ hasText: pattern }),
      root.locator(valueSelector)
    ])

    if (match) {
      return match
    }
  }

  return null
}

const SUBMIT_SUCCESS_KEYWORDS = [
  "发布成功",
  "提交成功",
  "刊登成功",
  "已提交",
  "已发布",
  "提交至平台",
  "审核中",
  "待审核",
  "核价",
  "success",
  "submitted",
  "published",
  "under review"
]

const SUBMIT_FAILURE_KEYWORDS = [
  "发布失败",
  "提交失败",
  "刊登失败",
  "失败",
  "错误",
  "异常",
  "请完善",
  "不能为空",
  "必填",
  "不符合",
  "校验",
  "重复",
  "超时",
  "error",
  "failed",
  "invalid",
  "required"
]

const SUBMIT_CONFIRM_KEYWORDS = [
  "确定",
  "确认",
  "继续",
  "发布",
  "提交",
  "立即发布",
  "立即提交",
  "ok",
  "confirm",
  "continue",
  "publish",
  "submit"
]

const MEDIA_APPLY_SUCCESS_KEYWORDS = [
  "\u5904\u7406\u6210\u529f",
  "\u5e94\u7528\u6210\u529f",
  "\u4fdd\u5b58\u6210\u529f",
  "\u7ffb\u8bd1\u6210\u529f",
  "\u5df2\u5e94\u7528",
  "\u5df2\u4fdd\u5b58",
  "\u5df2\u5b8c\u6210",
  "\u5b8c\u6210",
  "success",
  "successful",
  "completed",
  "complete",
  "applied",
  "saved",
  "done"
]

const MEDIA_APPLY_FAILURE_KEYWORDS = [
  "\u5904\u7406\u5931\u8d25",
  "\u5e94\u7528\u5931\u8d25",
  "\u4fdd\u5b58\u5931\u8d25",
  "\u7ffb\u8bd1\u5931\u8d25",
  "\u5931\u8d25",
  "\u9519\u8bef",
  "\u5f02\u5e38",
  "\u7f3a\u5c11",
  "\u65e0\u6548",
  "\u4e0d\u652f\u6301",
  "\u4e0d\u7b26\u5408",
  "\u8d85\u65f6",
  "\u5c3a\u5bf8",
  "\u5927\u5c0f",
  "\u56fe\u7247\u4e0d\u5408\u89c4",
  "\u5fc5\u586b",
  "failed",
  "failure",
  "error",
  "missing",
  "invalid",
  "unsupported",
  "timeout",
  "too large",
  "too small",
  "required"
]

const MEDIA_TRANSIENT_FAILURE_KEYWORDS = [
  "\u7a0d\u540e",
  "\u91cd\u8bd5",
  "\u7f51\u7edc",
  "\u7e41\u5fd9",
  "\u8bf7\u7a0d\u540e",
  "try again",
  "retry",
  "temporary",
  "temporarily",
  "busy",
  "network",
  "rate limit",
  "too many requests",
  "service unavailable"
]

const MEDIA_TRANSIENT_MAX_APPLY_ATTEMPTS = 3

const MEDIA_INVALID_FAILURE_KEYWORDS = [
  "\u65e0\u6548",
  "\u4e0d\u7b26\u5408",
  "\u4e0d\u5408\u89c4",
  "\u5c3a\u5bf8",
  "\u5927\u5c0f",
  "invalid",
  "too large",
  "too small",
  "size",
  "dimension"
]

const MEDIA_MISSING_INPUT_FAILURE_KEYWORDS = [
  "\u7f3a\u5c11",
  "\u5fc5\u586b",
  "missing",
  "required",
  "empty"
]

const MEDIA_UNSUPPORTED_FAILURE_KEYWORDS = [
  "\u4e0d\u652f\u6301",
  "unsupported",
  "not supported"
]

const classifyMediaFailure = (message: string, fallback: MediaFailureKind = "unknown"): {
  failureKind: MediaFailureKind
  retryable: boolean
} => {
  const normalized = message.toLowerCase()
  const includesAny = (patterns: string[]) => patterns.some((pattern) => normalized.includes(pattern.toLowerCase()))

  if (includesAny(MEDIA_TRANSIENT_FAILURE_KEYWORDS)) {
    return {
      failureKind: "transient",
      retryable: true
    }
  }

  if (includesAny(MEDIA_INVALID_FAILURE_KEYWORDS)) {
    return {
      failureKind: "invalid-media",
      retryable: false
    }
  }

  if (includesAny(MEDIA_MISSING_INPUT_FAILURE_KEYWORDS)) {
    return {
      failureKind: "missing-input",
      retryable: false
    }
  }

  if (includesAny(MEDIA_UNSUPPORTED_FAILURE_KEYWORDS)) {
    return {
      failureKind: "unsupported",
      retryable: false
    }
  }

  return {
    failureKind: fallback,
    retryable: fallback === "unknown"
  }
}

const SUBMIT_FEEDBACK_SELECTORS = [
  "#submitStatus",
  "[id*='submitstatus' i]",
  "[id*='publishstatus' i]",
  "[role='alert']",
  "[aria-live]",
  ".ant-message",
  ".ant-notification",
  ".ant-alert",
  ".ant-form-item-explain-error",
  ".ant-form-item-extra",
  ".el-message",
  ".el-notification",
  ".el-form-item__error",
  ".toast",
  ".message",
  ".notification",
  ".notice",
  ".error",
  ".success",
  "[class*='toast' i]",
  "[class*='message' i]",
  "[class*='notification' i]",
  "[class*='notice' i]",
  "[class*='error' i]",
  "[class*='success' i]",
  "[class*='invalid' i]"
]

const normalizeFeedbackText = (value: string) =>
  value.replace(/\s+/g, " ").trim().slice(0, 500)

const keywordMatch = (text: string, keywords: string[]) => {
  const normalized = text.toLowerCase()
  return keywords.find((keyword) => normalized.includes(keyword.toLowerCase())) ?? null
}

const focusBodyFeedbackText = (text: string, matchedKeyword: string, source: string) => {
  if (source !== "body") {
    return text
  }

  const normalized = normalizeFeedbackText(text)
  const keywordIndex = normalized.toLowerCase().indexOf(matchedKeyword.toLowerCase())
  if (keywordIndex < 0) {
    return normalized
  }

  const boundaryChars = ".!?;。！？；"
  const searchStart = Math.max(0, keywordIndex - 80)
  let start = -1
  for (let index = keywordIndex - 1; index >= searchStart; index -= 1) {
    if (boundaryChars.includes(normalized[index])) {
      start = index + 1
      break
    }
  }

  if (start < 0) {
    start = Math.max(0, keywordIndex - 20)
  }

  const searchEnd = Math.min(normalized.length, keywordIndex + 180)
  let end = searchEnd
  for (let index = keywordIndex; index < searchEnd; index += 1) {
    if (boundaryChars.includes(normalized[index])) {
      end = index + 1
      break
    }
  }

  return normalizeFeedbackText(normalized.slice(start, end)) || normalized
}

const collectFeedbackTexts = async (page: Page) => {
  const texts: Array<{ source: string; text: string }> = []

  for (const selector of SUBMIT_FEEDBACK_SELECTORS) {
    const locator = page.locator(selector)
    const count = Math.min(await locator.count().catch(() => 0), 12)
    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index)
      if (!await item.isVisible().catch(() => false)) {
        continue
      }

      const text = normalizeFeedbackText(await item.innerText().catch(() => ""))
      if (text) {
        texts.push({
          source: selector,
          text
        })
      }
    }
  }

  const bodyText = normalizeFeedbackText(await page.locator("body").innerText().catch(() => ""))
  if (bodyText) {
    texts.push({
      source: "body",
      text: bodyText
    })
  }

  return texts
}

const readSubmitFeedback = async (page: Page): Promise<SubmitFeedback> => {
  const texts = await collectFeedbackTexts(page)

  for (const item of texts) {
    const matchedKeyword = keywordMatch(item.text, SUBMIT_FAILURE_KEYWORDS)
    if (matchedKeyword) {
      return {
        state: "failure",
        message: focusBodyFeedbackText(item.text, matchedKeyword, item.source),
        source: item.source
      }
    }
  }

  for (const item of texts) {
    const matchedKeyword = keywordMatch(item.text, SUBMIT_SUCCESS_KEYWORDS)
    if (matchedKeyword) {
      return {
        state: "success",
        message: focusBodyFeedbackText(item.text, matchedKeyword, item.source),
        source: item.source
      }
    }
  }

  return {
    state: "unknown",
    message: texts[0]?.text ?? "",
    source: texts[0]?.source ?? "none"
  }
}

const sameSubmitFeedback = (left: SubmitFeedback, right: SubmitFeedback | null | undefined) =>
  Boolean(right)
  && left.state === right?.state
  && left.source === right?.source
  && left.message === right?.message

const readMediaApplyFeedback = async (page: Page, root: Locator | null): Promise<MediaApplyFeedback> => {
  const texts = [
    ...(root
      ? [{
          source: "media-surface",
          text: normalizeFeedbackText(await root.innerText().catch(() => ""))
        }].filter((item) => item.text)
      : []),
    ...await collectFeedbackTexts(page)
  ]

  for (const item of texts) {
    if (keywordMatch(item.text, MEDIA_APPLY_FAILURE_KEYWORDS)) {
      return {
        state: "failure",
        message: item.text,
        source: item.source
      }
    }
  }

  for (const item of texts) {
    if (keywordMatch(item.text, MEDIA_APPLY_SUCCESS_KEYWORDS)) {
      return {
        state: "success",
        message: item.text,
        source: item.source
      }
    }
  }

  return {
    state: "unknown",
    message: texts[0]?.text ?? "",
    source: texts[0]?.source ?? "none"
  }
}

const sameMediaApplyFeedback = (left: MediaApplyFeedback, right: MediaApplyFeedback | null | undefined) =>
  Boolean(right)
  && left.state === right?.state
  && left.source === right?.source
  && left.message === right?.message

const waitForMediaApplyFeedback = async (
  page: Page,
  root: Locator | null,
  timeoutMs = 8_000,
  previousFeedback?: MediaApplyFeedback | null,
  duplicateFeedbackGraceMs = 2_500
): Promise<MediaApplyFeedback> => {
  const startedAt = Date.now()
  let latest: MediaApplyFeedback = {
    state: "unknown",
    message: "",
    source: "none"
  }

  while (Date.now() - startedAt < timeoutMs) {
    latest = await readMediaApplyFeedback(page, root)
    if (latest.state !== "unknown") {
      if (!sameMediaApplyFeedback(latest, previousFeedback) || Date.now() - startedAt >= duplicateFeedbackGraceMs) {
        return latest
      }
    }

    await page.waitForTimeout(500)
  }

  return latest
}

const waitForSubmitFeedback = async (
  page: Page,
  timeoutMs = 12_000,
  previousFeedback?: SubmitFeedback | null,
  duplicateFailureGraceMs = 2_500,
  duplicateSuccessGraceMs = 2_500
): Promise<SubmitFeedback> => {
  const startedAt = Date.now()
  let latest: SubmitFeedback = {
    state: "unknown",
    message: "",
    source: "none"
  }

  while (Date.now() - startedAt < timeoutMs) {
    latest = await readSubmitFeedback(page)
    if (latest.state !== "unknown") {
      if (!sameSubmitFeedback(latest, previousFeedback)) {
        return latest
      }

      if (latest.state === "failure" && Date.now() - startedAt >= duplicateFailureGraceMs) {
        return latest
      }

      if (latest.state === "success" && Date.now() - startedAt >= duplicateSuccessGraceMs) {
        return {
          state: "unknown",
          message: latest.message,
          source: latest.source
        }
      }
    }

    await page.waitForTimeout(500)
  }
  return latest
}

const clickSubmitConfirmIfPresent = async (page: Page) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const dialogs = await visibleDialogLocators(page)
    const root = dialogs[dialogs.length - 1]
    if (!root) {
      return false
    }

    const button = await findInteractiveInRootByKeywords(root, SUBMIT_CONFIRM_KEYWORDS)
    if (button && await button.isVisible().catch(() => false)) {
      await button.click()
      return true
    }

    await page.waitForTimeout(500)
  }

  return false
}

const runSubmitAttempt = async (
  page: Page,
  config: DianxiaomiSelectorConfig,
  attempt: number
): Promise<SubmitAttemptResult> => {
  const previousFeedback = await readSubmitFeedback(page)
  const clickedSubmit = await clickByKeywords(page, ["发布", "提交", "立即刊登", "submit", "publish"], config.buttons?.submit)
  if (!clickedSubmit) {
    return {
      attempt,
      clickedSubmit: false,
      clickedConfirm: false,
      feedbackChanged: false,
      state: "failure",
      message: "未找到店小秘发布/提交按钮",
      source: "submit-button"
    }
  }

  await page.waitForTimeout(800)
  const clickedConfirm = await clickSubmitConfirmIfPresent(page)
  const feedback = await waitForSubmitFeedback(page, 12_000, previousFeedback)

  return {
    attempt,
    clickedSubmit,
    clickedConfirm,
    feedbackChanged: feedback.state !== "unknown" && !sameSubmitFeedback(feedback, previousFeedback),
    ...feedback
  }
}

const submitListingWithVerification = async (
  page: Page,
  config: DianxiaomiSelectorConfig,
  options: RunnerOptions
) => {
  const attempts: SubmitAttemptResult[] = []
  const maxAttempts = Math.max(1, Math.min(10, options.submitMaxAttempts))

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runSubmitAttempt(page, config, attempt)
    attempts.push(result)
    console.log(`submit-listing attempt ${attempt}/${maxAttempts}: ${result.state} ${result.message}`)

    if (result.state === "success" && result.feedbackChanged) {
      return stepResult(
        "submit-listing",
        "Submit listing",
        "done",
        `Dianxiaomi submit succeeded: ${result.message || "success"}`,
        {
          attempts,
          maxAttempts,
          success: true,
          verified: true
        }
      )
    }

    await page.waitForTimeout(1500)
  }

  const lastAttempt = attempts[attempts.length - 1]
  const lastFailureReason = lastAttempt?.state === "failure"
    ? lastAttempt.message
    : "no verified success message detected"
  return stepResult(
    "submit-listing",
    "Submit listing",
    "failed",
    `Dianxiaomi submit did not succeed: ${lastFailureReason}`,
    {
      attempts,
      maxAttempts,
      success: false,
      verified: false,
      failureReason: lastFailureReason
    }
  )
}

const findByConfiguredSelectorsInRoot = async (root: Locator, selectors: string[] | undefined): Promise<Locator | null> => {
  if (!selectors?.length) {
    return null
  }

  return firstVisible(selectors.map((selector) => root.locator(selector)))
}

const getConfiguredMediaActionSelectors = (
  config: DianxiaomiSelectorConfig,
  action: "apply" | "close",
  tool: Pick<MediaToolDefinition, "configKey">
) => config.mediaToolActions?.[action]?.[tool.configKey]

const findMediaApplyButtonForTool = async (
  page: Page,
  config: DianxiaomiSelectorConfig,
  tool: Pick<MediaToolDefinition, "id" | "configKey">
) => {
  const dialog = await getLatestMediaDialog(page)
  if (!dialog) {
    return null
  }

  return await findByConfiguredSelectorsInRoot(dialog, getConfiguredMediaActionSelectors(config, "apply", tool))
    ?? await findInteractiveInRootByKeywords(dialog, MEDIA_APPLY_KEYWORDS[tool.id])
}

const inspectMediaSurface = async (
  page: Page,
  tool: Pick<MediaToolDefinition, "keywords" | "label">
): Promise<MediaSurfaceInspection> => {
  const dialog = await getLatestMediaDialog(page)
  if (!dialog) {
    return {
      state: "missing",
      matchedKeyword: null,
      text: normalizeFeedbackText(await page.locator("body").innerText().catch(() => ""))
    }
  }

  const text = normalizeFeedbackText(await dialog.innerText().catch(() => ""))
  const matchedKeyword = keywordMatch(text, tool.keywords)
  return {
    state: matchedKeyword ? "matched" : "mismatched",
    matchedKeyword,
    text
  }
}

const closeMediaSurfaceIfOpen = async (
  page: Page,
  config: DianxiaomiSelectorConfig = {},
  tool?: Pick<MediaToolDefinition, "configKey">
) => {
  const dialogs = await visibleDialogLocators(page)
  const surface = dialogs[dialogs.length - 1]
  if (!surface) {
    return false
  }

  const closeButton = (tool
    ? await findByConfiguredSelectorsInRoot(surface, getConfiguredMediaActionSelectors(config, "close", tool))
    : null)
    ?? await findInteractiveInRootByKeywords(surface, MEDIA_CLOSE_KEYWORDS)
    ?? await firstVisible([
      surface.locator("[aria-label*='close' i]"),
      surface.locator("[title*='close' i]"),
      surface.locator(".ant-modal-close, .el-dialog__headerbtn, .modal-close, [class*='close' i]")
    ])

  if (!closeButton) {
    return false
  }

  await closeButton.click()
  await page.waitForTimeout(500)
  return true
}

const captureMediaScreenshot = async (page: Page, screenshotDir: string, prefix: string, toolId: string) => {
  const screenshotPath = path.join(
    screenshotDir,
    `${prefix}-${safeArtifactName(toolId)}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`
  )
  await page.screenshot({
    path: screenshotPath,
    fullPage: true
  })
  return screenshotPath
}

const sortMediaToolsForExecution = (tools: MediaToolSafetyItem[], requestedTools: string[] = []) => {
  const requestedOrder = new Map(
    requestedTools
      .map((tool) => tool.trim())
      .filter(Boolean)
      .flatMap((tool, index) => [[tool, index]] as Array<[string, number]>)
  )

  if (requestedOrder.size === 0) {
    return tools
  }

  return [...tools].sort((left, right) => {
    const leftOrder = Math.min(
      requestedOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER,
      requestedOrder.get(left.configKey) ?? Number.MAX_SAFE_INTEGER
    )
    const rightOrder = Math.min(
      requestedOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER,
      requestedOrder.get(right.configKey) ?? Number.MAX_SAFE_INTEGER
    )

    return leftOrder - rightOrder
  })
}

const buildMediaProcessingSafetyPlan = async (
  page: Page,
  config: DianxiaomiSelectorConfig = {},
  options?: Pick<RunnerOptions, "mediaAutomationMode" | "mediaAutomationTools">
): Promise<MediaProcessingSafetyPlan> => {
  const pageState = await getPageSafetyState(page)
  const candidates = await collectMediaToolCandidates(page, config)
  const safeMode = options?.mediaAutomationMode ?? "plan-only"
  const allowedTools = new Set((options?.mediaAutomationTools ?? []).map((tool) => tool.trim()).filter(Boolean))
  const allowAllTools = allowedTools.size === 0
  const tools = sortMediaToolsForExecution(candidates.map<MediaToolSafetyItem>((candidate) => {
    const available = Boolean(candidate.locator)
    const blockedByDialog = pageState.visibleDialogCount > 0
    const allowedForUnattended = allowAllTools || allowedTools.has(candidate.id) || allowedTools.has(candidate.configKey)
    const status: MediaToolSafetyStatus = !available
      ? "missing-tool"
      : blockedByDialog
        ? "blocked-by-open-dialog"
        : safeMode === "unattended-apply" && allowedForUnattended
        ? "ready-for-unattended-apply"
        : safeMode === "unattended-open" && allowedForUnattended
          ? "ready-for-unattended-open"
          : "manual-confirmation-required"
    const reason = !available
      ? `${candidate.label} entry is not visible on the current surface`
      : blockedByDialog
        ? `${candidate.label} was found, but an open dialog must be resolved before using image tools`
        : status === "ready-for-unattended-apply"
          ? `${candidate.label} is available and allowed for unattended apply`
        : status === "ready-for-unattended-open"
          ? `${candidate.label} is available and allowed for unattended entry opening`
          : `${candidate.label} is available; unattended mode did not include this tool`

    return {
      id: candidate.id,
      configKey: candidate.configKey,
      label: candidate.label,
      available,
      selectorConfigured: candidate.selectorConfigured,
      status,
      reason,
      requiresManualConfirmation: status === "manual-confirmation-required",
      wouldClick: status === "ready-for-unattended-open" || status === "ready-for-unattended-apply",
      wouldApply: status === "ready-for-unattended-apply",
      clicked: false,
      applied: false,
      locator: candidate.locatorDescriptor
    }
  }), options?.mediaAutomationTools)
  const availableCount = tools.filter((tool) => tool.available).length
  const blocked = tools.some((tool) => tool.status === "blocked-by-open-dialog")

  return {
    safeMode,
    wouldClick: tools.some((tool) => tool.wouldClick),
    wouldApply: tools.some((tool) => tool.wouldApply),
    guardStatus: blocked ? "blocked" : availableCount > 0 ? "manual-ready" : "no-tools",
    manualConfirmationRequired: tools.some((tool) => tool.requiresManualConfirmation),
    pageState,
    tools
  }
}

const openUnattendedMediaTools = async (
  page: Page,
  config: DianxiaomiSelectorConfig = {},
  options: Pick<RunnerOptions, "mediaAutomationMode" | "mediaAutomationTools" | "screenshotDir">
): Promise<MediaProcessingSafetyPlan> => {
  const plan = await buildMediaProcessingSafetyPlan(page, config, options)

  if (options.mediaAutomationMode !== "unattended-open" || plan.guardStatus === "blocked") {
    return plan
  }

  const candidates = await collectMediaToolCandidates(page, config)
  for (const tool of plan.tools) {
    if (!tool.wouldClick) {
      continue
    }

    const candidate = candidates.find((item) => item.id === tool.id)
    if (!candidate?.locator) {
      tool.status = "missing-tool"
      tool.reason = `${tool.label} entry disappeared before unattended open`
      tool.wouldClick = false
      continue
    }

    tool.beforeUrl = page.url()
    tool.beforeDialogCount = (await getPageSafetyState(page)).visibleDialogCount

    try {
      await candidate.locator.scrollIntoViewIfNeeded()
      await candidate.locator.click()
      await page.waitForTimeout(800)
      const afterState = await getPageSafetyState(page)
      const screenshotPath = path.join(
        options.screenshotDir,
        `media-open-${safeArtifactName(tool.id)}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`
      )
      await page.screenshot({
        path: screenshotPath,
        fullPage: true
      })

      tool.clicked = true
      tool.status = "opened"
      tool.reason = `${tool.label} entry opened in unattended mode; internal apply/save actions were not clicked`
      tool.afterUrl = page.url()
      tool.afterDialogCount = afterState.visibleDialogCount
      tool.screenshotPath = screenshotPath
      tool.error = null
    } catch (error) {
      tool.clicked = false
      tool.status = "open-failed"
      tool.reason = `${tool.label} could not be opened in unattended mode`
      tool.afterUrl = page.url()
      tool.afterDialogCount = (await getPageSafetyState(page)).visibleDialogCount
      tool.screenshotPath = null
      tool.error = error instanceof Error ? error.message : String(error)
    }
  }

  return {
    ...plan,
    wouldClick: plan.tools.some((tool) => tool.clicked),
    wouldApply: plan.tools.some((tool) => tool.applied),
    manualConfirmationRequired: plan.tools.some((tool) => tool.requiresManualConfirmation)
  }
}

const applyUnattendedMediaTools = async (
  page: Page,
  config: DianxiaomiSelectorConfig = {},
  options: Pick<RunnerOptions, "mediaAutomationMode" | "mediaAutomationTools" | "screenshotDir">
): Promise<MediaProcessingSafetyPlan> => {
  const plan = await buildMediaProcessingSafetyPlan(page, config, options)

  if (options.mediaAutomationMode !== "unattended-apply" || plan.guardStatus === "blocked") {
    return plan
  }

  const candidates = await collectMediaToolCandidates(page, config)
  let blockedByPriorFailure = false
  for (const tool of plan.tools) {
    if (!tool.wouldApply) {
      continue
    }

    if (blockedByPriorFailure) {
      tool.status = "blocked-by-media-failure"
      tool.reason = `${tool.label} was not attempted because a previous media tool failed`
      tool.wouldClick = false
      tool.wouldApply = false
      tool.clicked = false
      tool.applied = false
      tool.failureKind = "unknown"
      tool.retryable = false
      continue
    }

    const currentState = await getPageSafetyState(page)
    if (currentState.visibleDialogCount > 0) {
      tool.status = "blocked-by-open-dialog"
      tool.reason = `${tool.label} was skipped because another media surface is still open`
      tool.wouldClick = false
      tool.wouldApply = false
      tool.beforeDialogCount = currentState.visibleDialogCount
      tool.failureKind = "return-blocked"
      tool.retryable = false
      continue
    }

    const candidate = candidates.find((item) => item.id === tool.id)
    if (!candidate?.locator) {
      tool.status = "missing-tool"
      tool.reason = `${tool.label} entry disappeared before unattended apply`
      tool.wouldClick = false
      tool.wouldApply = false
      continue
    }

    tool.beforeUrl = page.url()
    tool.beforeDialogCount = (await getPageSafetyState(page)).visibleDialogCount

    try {
      await candidate.locator.scrollIntoViewIfNeeded()
      await candidate.locator.click()
      await page.waitForTimeout(800)
      const afterOpenState = await getPageSafetyState(page)
      tool.clicked = true
      tool.afterUrl = page.url()
      tool.afterDialogCount = afterOpenState.visibleDialogCount
      tool.screenshotPath = await captureMediaScreenshot(page, options.screenshotDir, "media-open", tool.id)

      const surfaceInspection = await inspectMediaSurface(page, candidate)
      tool.surfaceState = surfaceInspection.state
      tool.surfaceMatchedKeyword = surfaceInspection.matchedKeyword
      tool.surfaceText = surfaceInspection.text
      if (surfaceInspection.state !== "matched") {
        const failure = surfaceInspection.state === "missing"
          ? { failureKind: "surface-missing" as const, retryable: false }
          : { failureKind: "surface-mismatch" as const, retryable: false }
        tool.applied = false
        tool.status = "apply-failed"
        tool.reason = surfaceInspection.state === "missing"
          ? `${tool.label} entry was clicked, but no media surface opened`
          : `${tool.label} entry opened an unexpected media surface`
        tool.beforeApplyScreenshotPath = await captureMediaScreenshot(page, options.screenshotDir, "media-surface-mismatch", tool.id)
        tool.failureKind = failure.failureKind
        tool.retryable = failure.retryable
        tool.error = surfaceInspection.state === "missing" ? "media surface missing" : "media surface mismatch"
        await closeMediaSurfaceIfOpen(page, config, tool)
        await page.waitForTimeout(500)
        tool.returnDialogCount = (await getPageSafetyState(page)).visibleDialogCount
        blockedByPriorFailure = true
        continue
      }

      const mediaSurface = await getLatestMediaDialog(page)
      const applyButton = await findMediaApplyButtonForTool(page, config, tool)
      tool.applyButton = await describeLocator(applyButton)
      if (!applyButton) {
        const failure = classifyMediaFailure("apply button missing", "apply-control-missing")
        tool.status = "apply-failed"
        tool.reason = `${tool.label} was opened, but no safe internal apply button was detected`
        tool.beforeApplyScreenshotPath = await captureMediaScreenshot(page, options.screenshotDir, "media-apply-missing", tool.id)
        tool.applyAttempts = 0
        tool.maxApplyAttempts = MEDIA_TRANSIENT_MAX_APPLY_ATTEMPTS
        tool.feedbackAttempts = []
        tool.failureKind = failure.failureKind
        tool.retryable = failure.retryable
        tool.error = "apply button missing"
        await closeMediaSurfaceIfOpen(page, config, tool)
        await page.waitForTimeout(500)
        tool.returnDialogCount = (await getPageSafetyState(page)).visibleDialogCount
        blockedByPriorFailure = true
        continue
      }

      tool.beforeApplyScreenshotPath = await captureMediaScreenshot(page, options.screenshotDir, "media-before-apply", tool.id)
      tool.maxApplyAttempts = MEDIA_TRANSIENT_MAX_APPLY_ATTEMPTS
      tool.feedbackAttempts = []

      let feedback: MediaApplyFeedback = {
        state: "unknown",
        message: "",
        source: "none"
      }
      let failure: ReturnType<typeof classifyMediaFailure> | null = null
      let previousFeedback: MediaApplyFeedback | null = null

      for (let attempt = 1; attempt <= MEDIA_TRANSIENT_MAX_APPLY_ATTEMPTS; attempt += 1) {
        tool.applyAttempts = attempt
        await applyButton.scrollIntoViewIfNeeded()
        await applyButton.click()
        feedback = await waitForMediaApplyFeedback(page, mediaSurface, 8_000, previousFeedback)
        previousFeedback = feedback

        failure = feedback.state === "success"
          ? null
          : classifyMediaFailure(feedback.message || "media apply success feedback not detected")
        tool.feedbackAttempts.push({
          attempt,
          ...feedback,
          ...(failure
            ? {
                failureKind: failure.failureKind,
                retryable: failure.retryable
              }
            : {})
        })

        tool.feedbackState = feedback.state
        tool.feedbackMessage = feedback.message
        tool.feedbackSource = feedback.source

        if (feedback.state === "success") {
          break
        }

        const shouldRetry = failure?.failureKind === "transient"
          && failure.retryable
          && attempt < MEDIA_TRANSIENT_MAX_APPLY_ATTEMPTS
        if (!shouldRetry) {
          break
        }

        await page.waitForTimeout(1500)
      }

      tool.afterApplyScreenshotPath = await captureMediaScreenshot(page, options.screenshotDir, "media-after-apply", tool.id)

      if (feedback.state !== "success") {
        failure = failure ?? classifyMediaFailure(feedback.message || "media apply success feedback not detected")
        tool.applied = false
        tool.status = "apply-failed"
        tool.reason = feedback.state === "failure"
          ? `${tool.label} internal apply returned failure feedback`
          : `${tool.label} internal apply feedback was not confirmed as successful`
        tool.failureKind = failure.failureKind
        tool.retryable = failure.retryable
        tool.error = feedback.message || "media apply success feedback not detected"
        await closeMediaSurfaceIfOpen(page, config, tool)
        await page.waitForTimeout(500)
        tool.returnDialogCount = (await getPageSafetyState(page)).visibleDialogCount
        blockedByPriorFailure = true
        continue
      }

      tool.applied = true

      await closeMediaSurfaceIfOpen(page, config, tool)
      await page.waitForTimeout(500)
      tool.returnDialogCount = (await getPageSafetyState(page)).visibleDialogCount
      if ((tool.returnDialogCount ?? 0) > 0) {
        const failure = classifyMediaFailure("media surface remained open after apply", "return-blocked")
        tool.status = "return-failed"
        tool.reason = `${tool.label} internal apply completed, but the media surface is still open`
        tool.failureKind = failure.failureKind
        tool.retryable = failure.retryable
        tool.error = "media surface remained open after apply"
      } else {
        tool.status = "applied"
        tool.reason = `${tool.label} was opened, applied, screenshotted, and returned to the listing editor in unattended mode`
        tool.error = null
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failure = classifyMediaFailure(message)
      tool.clicked = Boolean(tool.clicked)
      tool.applied = false
      tool.status = tool.clicked ? "apply-failed" : "open-failed"
      tool.reason = `${tool.label} could not be completed in unattended apply mode`
      tool.afterUrl = page.url()
      tool.afterDialogCount = (await getPageSafetyState(page)).visibleDialogCount
      tool.failureKind = failure.failureKind
      tool.retryable = failure.retryable
      tool.error = message
      blockedByPriorFailure = true
    }
  }

  return {
    ...plan,
    wouldClick: plan.tools.some((tool) => tool.clicked),
    wouldApply: plan.tools.some((tool) => tool.applied),
    manualConfirmationRequired: plan.tools.some((tool) => tool.requiresManualConfirmation),
    guardStatus: plan.tools.some((tool) => tool.status === "blocked-by-open-dialog") ? "blocked" : plan.guardStatus
  }
}

export const inspectMediaTools = async (page: Page, config: DianxiaomiSelectorConfig = {}) => {
  const results: AutomationStepResult[] = []
  const candidates = await collectMediaToolCandidates(page, config)

  for (const tool of candidates) {
    results.push(stepResult(
      `inspect-media-${tool.id}`,
      `Inspect ${tool.label}`,
      tool.locator ? "done" : "skipped",
      tool.locator ? `${tool.label} tool signal found` : `${tool.label} tool signal not found`,
      {
        keywords: tool.keywords,
        selectorConfigured: tool.selectorConfigured,
        locator: tool.locatorDescriptor
      }
    ))
  }

  const foundTools = results.filter((step) => step.status === "done").map((step) => step.id.replace("inspect-media-", ""))
  results.push(stepResult(
    "inspect-media-summary",
    "Inspect media tools",
    foundTools.length > 0 ? "done" : "skipped",
    foundTools.length > 0
      ? `Dianxiaomi media tools found: ${foundTools.join(", ")}`
      : "No Dianxiaomi media tools found on the current surface",
    {
      foundTools,
      expectedTools: DIANXIAOMI_MEDIA_TOOLS.map((tool) => tool.id)
    }
  ))

  return results
}

export const planMediaProcessing = async (
  page: Page,
  config: DianxiaomiSelectorConfig = {},
  options?: Pick<RunnerOptions, "mediaAutomationMode" | "mediaAutomationTools" | "screenshotDir">
) => {
  const toolSteps = await inspectMediaTools(page, config)
  const safetyPlan = options?.mediaAutomationMode === "unattended-apply"
    ? await applyUnattendedMediaTools(page, config, options)
    : options?.mediaAutomationMode === "unattended-open"
      ? await openUnattendedMediaTools(page, config, options)
      : await buildMediaProcessingSafetyPlan(page, config, options)
  const foundTools = toolSteps
    .filter((step) => step.id.startsWith("inspect-media-") && step.status === "done")
    .map((step) => step.id.replace("inspect-media-", ""))
  const recommendedOrder = [
    "image-translation",
    "batch-resize",
    "white-background",
    "image-editor"
  ]
  const availableActions = recommendedOrder.filter((tool) => foundTools.includes(tool))

  return stepResult(
    "media-processing-plan",
    "Media processing plan",
    safetyPlan.tools.some((tool) => ["open-failed", "apply-failed", "return-failed", "blocked-by-media-failure"].includes(tool.status))
      ? "failed"
      : safetyPlan.wouldClick || safetyPlan.wouldApply
        ? "done"
        : "skipped",
    availableActions.length > 0
      ? safetyPlan.safeMode === "unattended-open"
        ? `Media tools detected for native Dianxiaomi processing: ${availableActions.join(", ")}. Unattended mode opened allowed tool entries only; internal apply/save actions were not clicked.`
        : safetyPlan.safeMode === "unattended-apply"
          ? `Media tools detected for native Dianxiaomi processing: ${availableActions.join(", ")}. Unattended mode applied allowed tool entries when a safe internal apply button was detected.`
        : `Media tools detected for manual/native Dianxiaomi processing: ${availableActions.join(", ")}. Manual confirmation is required; automation does not click these tools yet.`
      : "No media tool entry was detected. Open Dianxiaomi image tools manually if image translation, resizing, white background, or editor review is required.",
    {
      foundTools,
      recommendedOrder,
      availableActions,
      safeMode: safetyPlan.safeMode,
      guardStatus: safetyPlan.guardStatus,
      manualConfirmationRequired: safetyPlan.manualConfirmationRequired,
      wouldClick: safetyPlan.wouldClick,
      wouldApply: safetyPlan.wouldApply,
      pageState: safetyPlan.pageState,
      tools: safetyPlan.tools
    }
  )
}

export const inspectMediaProcessingSafety = async (
  page: Page,
  config: DianxiaomiSelectorConfig = {},
  options?: Pick<RunnerOptions, "mediaAutomationMode" | "mediaAutomationTools">
) => {
  const safetyPlan = await buildMediaProcessingSafetyPlan(page, config, options)
  return stepResult(
    "media-processing-safety",
    "Media processing safety",
    safetyPlan.guardStatus === "blocked" ? "failed" : safetyPlan.guardStatus === "manual-ready" ? "done" : "skipped",
    safetyPlan.guardStatus === "blocked"
      ? "Media tool execution is blocked until open dialogs are resolved"
      : safetyPlan.guardStatus === "manual-ready"
      ? safetyPlan.safeMode === "unattended-open"
        ? "Media tools are available for unattended entry opening"
        : safetyPlan.safeMode === "unattended-apply"
          ? "Media tools are available for unattended internal apply"
        : "Media tools are available, but require manual confirmation before any click"
        : "No media tools are available for native Dianxiaomi image processing",
    safetyPlan
  )
}

const inspectRepairSingleField = async (
  page: Page,
  action: DianxiaomiProductRepairAction,
  config: DianxiaomiSelectorConfig
) => {
  const kind = action.payload?.fieldKind
  if (!kind || kind === "attribute") {
    return stepResult(
      `repair-preview-${action.id}`,
      `Repair preview ${action.label}`,
      "failed",
      `Repair action ${action.id} does not specify a supported single field`,
      {
        actionId: action.id,
        writer: action.payload?.writer ?? null,
        fieldKind: kind ?? null,
        target: action.target ?? null
      }
    )
  }

  const field = await findField(page, kind, config)
  return stepResult(
    `repair-preview-${action.id}`,
    `Repair preview ${action.label}`,
    field ? "done" : "failed",
    field ? `Repair target field is ready: ${kind}` : `Repair target field is missing: ${kind}`,
    {
      actionId: action.id,
      writer: action.payload?.writer,
      fieldKind: kind,
      selectorGroup: action.payload?.selectorGroup,
      selectorKey: action.payload?.selectorKey,
      target: action.target ?? null
    }
  )
}

const inspectRepairAttributes = async (
  page: Page,
  action: DianxiaomiProductRepairAction,
  draft: ListingDraft,
  config: DianxiaomiSelectorConfig
) => {
  const attributeKey = action.payload?.attributeKey?.trim()
  const draftAttributes = draft.attributes ?? {}
  const keysToCheck = attributeKey ? [attributeKey] : Object.keys(draftAttributes)
  const existingDraftKeys = keysToCheck.filter((key) => Object.prototype.hasOwnProperty.call(draftAttributes, key))
  const keywordSource = existingDraftKeys.length > 0 ? existingDraftKeys : keysToCheck
  const keywords = Array.from(new Set(keywordSource.flatMap((key) => ATTRIBUTE_ALIASES[key] ?? [key])))
    .map((keyword) => keyword.trim())
    .filter(Boolean)
  const field = await findByConfiguredSelectors(page, config.fields?.attribute)
    ?? (keywords.length > 0 ? await findFieldByKeyword(page, keywords) : await findField(page, "attribute", config))
  const hasKnownValue = !attributeKey || existingDraftKeys.length > 0
  const status: StepStatus = field && hasKnownValue ? "done" : "failed"
  const detail = !hasKnownValue
    ? `Repair attribute has no known draft value: ${attributeKey}`
    : field
      ? `Repair attribute target is ready: ${attributeKey || "draft attributes"}`
      : `Repair attribute field is missing: ${attributeKey || "draft attributes"}`

  return stepResult(
    `repair-preview-${action.id}`,
    `Repair preview ${action.label}`,
    status,
    detail,
    {
      actionId: action.id,
      writer: action.payload?.writer,
      attributeKey: attributeKey || null,
      target: action.target ?? null,
      hasKnownValue,
      knownDraftKeys: existingDraftKeys,
      selectorGroup: action.payload?.selectorGroup,
      selectorKey: action.payload?.selectorKey
    }
  )
}

const inspectRepairSkuPricing = async (
  page: Page,
  action: DianxiaomiProductRepairAction,
  draft: ListingDraft,
  config: DianxiaomiSelectorConfig
) => {
  const rows = await findSkuRows(page, config)
  const globalPrice = rows.length > 0 ? null : await findField(page, "price", config)
  const globalStock = rows.length > 0 ? null : await findField(page, "stock", config)
  const ready = draft.skuPricing.length > 0 && (rows.length > 0 || Boolean(globalPrice || globalStock))

  return stepResult(
    `repair-preview-${action.id}`,
    `Repair preview ${action.label}`,
    ready ? "done" : "failed",
    ready
      ? `SKU repair target is ready: ${rows.length} row(s), ${draft.skuPricing.length} draft SKU(s)`
      : "SKU repair target is missing rows or draft SKU pricing",
    {
      actionId: action.id,
      writer: action.payload?.writer,
      skuMode: action.payload?.skuMode,
      expectedSkuCount: draft.skuPricing.length,
      detectedRows: rows.length,
      globalPriceField: Boolean(globalPrice),
      globalStockField: Boolean(globalStock),
      selectorGroup: action.payload?.selectorGroup,
      selectorKey: action.payload?.selectorKey
    }
  )
}

const inspectRepairMediaTool = async (
  page: Page,
  action: DianxiaomiProductRepairAction,
  config: DianxiaomiSelectorConfig
) => {
  const mediaTool = action.payload?.mediaTool
  const candidates = await collectMediaToolCandidates(page, config)
  const candidate = mediaTool
    ? candidates.find((item) => item.configKey === mediaTool)
    : null

  return stepResult(
    `repair-preview-${action.id}`,
    `Repair preview ${action.label}`,
    candidate?.locator ? "done" : "failed",
    candidate?.locator
      ? `Repair media tool is ready: ${mediaTool}`
      : `Repair media tool is missing: ${mediaTool ?? "unknown"}`,
    {
      actionId: action.id,
      writer: action.payload?.writer,
      mediaTool: mediaTool ?? null,
      selectorConfigured: candidate?.selectorConfigured ?? false,
      locator: candidate?.locatorDescriptor ?? null,
      selectorGroup: action.payload?.selectorGroup,
      selectorKey: action.payload?.selectorKey
    }
  )
}

const inspectRepairAction = async (
  page: Page,
  action: DianxiaomiProductRepairAction,
  draft: ListingDraft,
  config: DianxiaomiSelectorConfig
) => {
  const writer = action.payload?.writer
  if (writer === "fill-single-field") {
    return inspectRepairSingleField(page, action, config)
  }

  if (writer === "fill-attributes") {
    return inspectRepairAttributes(page, action, draft, config)
  }

  if (writer === "fill-sku-pricing") {
    return inspectRepairSkuPricing(page, action, draft, config)
  }

  if (writer === "run-media-tool") {
    return inspectRepairMediaTool(page, action, config)
  }

  return stepResult(
    `repair-preview-${action.id}`,
    `Repair preview ${action.label}`,
    "skipped",
    writer
      ? `Repair writer is not executable in browser preview: ${writer}`
      : "Repair action has no executable payload",
    {
      actionId: action.id,
      writer: writer ?? null,
      actionType: action.type,
      automation: action.automation,
      target: action.target ?? null
    }
  )
}

const repairApplyResult = (
  action: DianxiaomiProductRepairAction,
  status: StepStatus,
  detail: string,
  data?: Record<string, unknown>
) => stepResult(
  `repair-apply-${action.id}`,
  `Repair apply ${action.label}`,
  status,
  detail,
  {
    actionId: action.id,
    actionType: action.type,
    automation: action.automation,
    required: action.required,
    writer: action.payload?.writer ?? null,
    target: action.target ?? null,
    ...data
  }
)

const valueForRepairSingleField = (
  action: DianxiaomiProductRepairAction,
  draft: ListingDraft
) => {
  const expectedValue = action.payload?.expectedValue?.trim()
  if (expectedValue) {
    return expectedValue
  }

  const kind = action.payload?.fieldKind
  if (kind === "title") {
    return draft.listingTitle
  }

  if (kind === "description") {
    return draft.description
  }

  if (kind === "price") {
    return draft.skuPricing[0]?.salePriceUsd.toFixed(2)
  }

  if (kind === "stock") {
    return draft.skuPricing[0] ? String(draft.skuPricing[0].stock) : undefined
  }

  return undefined
}

const applyRepairSingleField = async (
  page: Page,
  action: DianxiaomiProductRepairAction,
  draft: ListingDraft,
  config: DianxiaomiSelectorConfig
) => {
  const kind = action.payload?.fieldKind
  if (!kind || kind === "attribute") {
    return repairApplyResult(action, "skipped", `Single-field repair is blocked for unsupported field: ${kind ?? "missing"}`, {
      fieldKind: kind ?? null
    })
  }

  const value = valueForRepairSingleField(action, draft)
  if (!value?.trim()) {
    return repairApplyResult(action, "skipped", `Single-field repair has no known safe value for ${kind}`, {
      fieldKind: kind,
      hasExpectedValue: Boolean(action.payload?.expectedValue?.trim())
    })
  }

  const written = await fillSingleField(page, kind, value, config)
  return repairApplyResult(
    action,
    written.status,
    written.status === "done"
      ? `Applied ${kind} from known task data`
      : `Could not apply ${kind}: ${written.detail}`,
    {
      fieldKind: kind,
      source: action.payload?.expectedValue?.trim() ? "repair-plan" : "task-draft",
      valueLength: value.length,
      writerResult: written
    }
  )
}

const applyRepairAttributes = async (
  page: Page,
  action: DianxiaomiProductRepairAction,
  draft: ListingDraft,
  config: DianxiaomiSelectorConfig
) => {
  const attributeKey = action.payload?.attributeKey?.trim()
  const draftAttributes = draft.attributes ?? {}
  const expectedValue = action.payload?.expectedValue?.trim()
  const draftValue = attributeKey ? draftAttributes[attributeKey]?.trim() : undefined
  const knownValue = draftValue || expectedValue
  if (!attributeKey || !knownValue?.trim()) {
    return repairApplyResult(action, "skipped", attributeKey
      ? `Attribute repair has no known safe value: ${attributeKey}`
      : "Attribute repair is blocked because no specific attribute key was provided", {
      attributeKey: attributeKey ?? null,
      hasExpectedValue: Boolean(expectedValue)
    })
  }

  const narrowDraft: ListingDraft = {
    ...draft,
    attributes: {
      [attributeKey]: knownValue
    }
  }
  const written = await fillAttributes(page, narrowDraft, config)
  return repairApplyResult(
    action,
    written.status,
    written.status === "done"
      ? `Applied attribute ${attributeKey} from known task data`
      : `Could not apply attribute ${attributeKey}: ${written.detail}`,
    {
      attributeKey,
      source: draftValue ? "task-draft" : "repair-plan",
      valueLength: knownValue.length,
      writerResult: written
    }
  )
}

const applyRepairSkuPricing = async (
  page: Page,
  action: DianxiaomiProductRepairAction,
  draft: ListingDraft,
  config: DianxiaomiSelectorConfig
) => {
  if (draft.skuPricing.length === 0) {
    return repairApplyResult(action, "skipped", "SKU repair has no known task SKU pricing")
  }

  const written = await fillSkuPricing(page, draft.skuPricing, config)
  return repairApplyResult(
    action,
    written.status,
    written.status === "done"
      ? `Applied SKU price/stock for ${draft.skuPricing.length} SKU(s)`
      : `Could not apply SKU price/stock: ${written.detail}`,
    {
      skuCount: draft.skuPricing.length,
      writerResult: written
    }
  )
}

const applyRepairMediaTool = async (
  page: Page,
  action: DianxiaomiProductRepairAction,
  config: DianxiaomiSelectorConfig,
  options?: RunnerOptions
) => {
  const mediaTool = action.payload?.mediaTool
  if (!mediaTool) {
    return repairApplyResult(action, "skipped", "Media repair has no specific tool allowlist")
  }

  const effectiveMode = options?.mediaAutomationMode === "unattended-apply" ? "unattended-apply" : "plan-only"
  const result = await planMediaProcessing(page, config, {
    mediaAutomationMode: effectiveMode,
    mediaAutomationTools: [mediaTool],
    screenshotDir: options?.screenshotDir ?? "output/playwright"
  })

  return repairApplyResult(
    action,
    result.status,
    effectiveMode === "unattended-apply"
      ? `Ran allowed Dianxiaomi media tool: ${mediaTool}`
      : `Media repair stayed in plan-only mode for tool: ${mediaTool}`,
    {
      mediaTool,
      mode: effectiveMode,
      writerResult: result
    }
  )
}

const applyRepairAction = async (
  page: Page,
  action: DianxiaomiProductRepairAction,
  draft: ListingDraft,
  config: DianxiaomiSelectorConfig,
  options?: RunnerOptions
) => {
  if (action.automation !== "auto" && action.automation !== "assisted") {
    return repairApplyResult(action, "skipped", `Repair action requires manual handling: ${action.automation}`)
  }

  const writer = action.payload?.writer
  if (writer === "fill-single-field") {
    return applyRepairSingleField(page, action, draft, config)
  }

  if (writer === "fill-attributes") {
    return applyRepairAttributes(page, action, draft, config)
  }

  if (writer === "fill-sku-pricing") {
    return applyRepairSkuPricing(page, action, draft, config)
  }

  if (writer === "run-media-tool") {
    return applyRepairMediaTool(page, action, config, options)
  }

  return repairApplyResult(
    action,
    "skipped",
    writer
      ? `Repair writer is not safe for browser execution: ${writer}`
      : "Repair action has no executable payload"
  )
}

export const inspectRepairPlanPreview = async (
  page: Page,
  draft: ListingDraft,
  repairPlan: DianxiaomiProductRepairPlan,
  config: DianxiaomiSelectorConfig = {}
) => {
  const results: AutomationStepResult[] = []
  const targetSurface = await inspectDianxiaomiTargetSurface(page, config)
  results.push(targetSurface)
  if (!targetSurfaceCanInspect(targetSurface)) {
    results.push(stepResult(
      "repair-preview-blocked-surface",
      "Repair preview blocked",
      "failed",
      "Repair preview was blocked because the current page is not a recognized Dianxiaomi listing edit surface",
      targetSurface.data
    ))
    return results
  }

  const actionable = repairPlan.actions.filter((action) => action.payload)
  if (actionable.length === 0) {
    results.push(stepResult(
      "repair-preview-empty",
      "Repair preview",
      "skipped",
      "Repair plan has no executable browser payload"
    ))
  }

  for (const action of actionable) {
    results.push(await inspectRepairAction(page, action, draft, config))
  }

  const checked = results.filter((step) => step.id.startsWith("repair-preview-") && step.id !== "repair-preview-summary")
  const readyCount = checked.filter((step) => step.status === "done").length
  const failedCount = checked.filter((step) => step.status === "failed").length
  const skippedCount = checked.filter((step) => step.status === "skipped").length
  results.push(stepResult(
    "repair-preview-summary",
    "Repair preview summary",
    failedCount > 0 ? "failed" : readyCount > 0 ? "done" : "skipped",
    `Repair preview checked ${checked.length} action(s): ready ${readyCount}, missing ${failedCount}, skipped ${skippedCount}`,
    {
      repairStatus: repairPlan.status,
      canAutoRepair: repairPlan.canAutoRepair,
      canRetryAfterRepair: repairPlan.canRetryAfterRepair,
      actionCount: repairPlan.actions.length,
      checkedCount: checked.length,
      readyCount,
      failedCount,
      skippedCount
    }
  ))

  return results
}

export const applyRepairPlan = async (
  page: Page,
  draft: ListingDraft,
  repairPlan: DianxiaomiProductRepairPlan,
  config: DianxiaomiSelectorConfig = {},
  options?: RunnerOptions
) => {
  const results: AutomationStepResult[] = []
  const targetSurface = await inspectDianxiaomiTargetSurface(page, config)
  results.push(targetSurface)
  if (!targetSurfaceCanWrite(targetSurface)) {
    results.push(stepResult(
      "repair-apply-blocked-surface",
      "Repair apply blocked",
      "failed",
      "Repair apply was blocked because the current page is not a recognized Dianxiaomi listing edit surface",
      targetSurface.data
    ))
    return results
  }

  const actionable = repairPlan.actions.filter((action) => action.payload)
  if (actionable.length === 0) {
    results.push(stepResult(
      "repair-apply-empty",
      "Repair apply",
      "skipped",
      "Repair plan has no executable browser payload"
    ))
  }

  for (const action of actionable) {
    results.push(await applyRepairAction(page, action, draft, config, options))
  }

  const applied = results.filter((step) => step.id.startsWith("repair-apply-") && step.id !== "repair-apply-summary")
  const doneCount = applied.filter((step) => step.status === "done").length
  const failedCount = applied.filter((step) => step.status === "failed").length
  const skippedCount = applied.filter((step) => step.status === "skipped").length
  results.push(stepResult(
    "repair-apply-summary",
    "Repair apply summary",
    failedCount > 0 ? "failed" : doneCount > 0 ? "done" : "skipped",
    `Repair apply handled ${applied.length} action(s): applied ${doneCount}, failed ${failedCount}, skipped ${skippedCount}`,
    {
      repairStatus: repairPlan.status,
      canAutoRepair: repairPlan.canAutoRepair,
      canRetryAfterRepair: repairPlan.canRetryAfterRepair,
      actionCount: repairPlan.actions.length,
      handledCount: applied.length,
      doneCount,
      failedCount,
      skippedCount,
      savedOrSubmitted: false
    }
  ))

  return results
}

export const fillDraft = async (
  page: Page,
  taskDraft: ListingDraft,
  config: DianxiaomiSelectorConfig = {},
  options?: RunnerOptions
) => {
  const results: AutomationStepResult[] = []
  const targetSurface = await inspectDianxiaomiTargetSurface(page, config)
  results.push(targetSurface)
  if (!targetSurfaceCanWrite(targetSurface)) {
    results.push(stepResult(
      "write-blocked-wrong-surface",
      "Write blocked",
      "failed",
      "Fill was blocked because the current page is not a recognized Dianxiaomi listing edit surface",
      targetSurface.data
    ))
    return results
  }

  results.push(await fillSingleField(page, "title", taskDraft.listingTitle, config))

  if (taskDraft.description) {
    results.push(await fillSingleField(page, "description", taskDraft.description, config))
  } else {
    results.push(stepResult("fill-description", "填写 description", "skipped", "任务没有 description"))
  }

  results.push(await fillAttributes(page, taskDraft, config))
  results.push(await fillSkuPricing(page, taskDraft.skuPricing, config))
  results.push(await inspectMediaProcessingSafety(page, config, options))
  results.push(await planMediaProcessing(page, config, options))
  if (results.some((step) => step.id === "media-processing-plan" && step.status === "failed")) {
    results.push(stepResult(
      "write-blocked-media-processing",
      "Write blocked",
      "failed",
      "Save/submit was blocked because unattended Dianxiaomi media processing did not complete successfully"
    ))
    return results
  }

  return results
}

const inspectField = async (page: Page, kind: FieldKind, config: DianxiaomiSelectorConfig) => {
  const field = await findField(page, kind, config)
  return stepResult(
    `inspect-${kind}`,
    `Inspect ${kind}`,
    field ? "done" : "failed",
    field ? `Field found: ${kind}` : `Field missing: ${kind}`
  )
}

export const inspectPublishSurface = async (
  page: Page,
  draft: ListingDraft,
  config: DianxiaomiSelectorConfig = {},
  options?: RunnerOptions
) => {
  const results: AutomationStepResult[] = []
  const targetSurface = await inspectDianxiaomiTargetSurface(page, config)
  results.push(targetSurface)
  if (!targetSurfaceCanInspect(targetSurface)) {
    return results
  }

  results.push(await inspectField(page, "title", config))
  results.push(await inspectField(page, "description", config))

  const writableAttributeKeys = Object.keys(draft.attributes).filter((key) => !isInternalDianxiaomiAttributeKey(key))
  if (writableAttributeKeys.length > 0) {
    const attributeField = await findByConfiguredSelectors(page, config.fields?.attribute) ?? await findFieldByKeyword(page, writableAttributeKeys)
    results.push(stepResult(
      "inspect-attribute",
      "Inspect attribute",
      attributeField ? "done" : "skipped",
      attributeField ? "Attribute field found" : "No generic attribute field found"
    ))
  } else {
    results.push(stepResult("inspect-attribute", "Inspect attribute", "skipped", "Task has no attributes"))
  }

  const rows = await findSkuRows(page, config)
  const priceField = rows.length > 0 ? null : await findField(page, "price", config)
  const stockField = rows.length > 0 ? null : await findField(page, "stock", config)

  results.push(stepResult(
    "inspect-sku-rows",
    "Inspect SKU rows",
    rows.length > 0 ? "done" : "failed",
    rows.length > 0 ? `SKU rows found: ${rows.length}` : "SKU rows missing",
    {
      expectedSkuCount: draft.skuPricing.length,
      detectedRows: rows.length
    }
  ))

  if (rows.length === 0) {
    results.push(stepResult(
      "inspect-price",
      "Inspect price",
      priceField ? "done" : "failed",
      priceField ? "Global price field found" : "Global price field missing"
    ))
    results.push(stepResult(
      "inspect-stock",
      "Inspect stock",
      stockField ? "done" : "failed",
      stockField ? "Global stock field found" : "Global stock field missing"
    ))
  }

  const saveButton = await findButtonByKeywords(page, ["淇濆瓨鑽夌", "淇濆瓨", "鏆傚瓨", "save draft", "save"], config.buttons?.save)
  const submitButton = await findButtonByKeywords(page, ["鍙戝竷", "鎻愪氦", "绔嬪嵆鍒婄櫥", "submit", "publish"], config.buttons?.submit)
  results.push(stepResult(
    "inspect-save-button",
    "Inspect save button",
    saveButton ? "done" : "skipped",
    saveButton ? "Configured save button found" : "Configured save button missing"
  ))
  results.push(stepResult(
    "inspect-submit-button",
    "Inspect submit button",
    submitButton ? "done" : "skipped",
    submitButton ? "Configured submit button found" : "Configured submit button missing"
  ))
  results.push(...await inspectMediaTools(page, config))
  results.push(await inspectMediaProcessingSafety(page, config, options))
  if (options?.mediaAutomationMode === "unattended-open" || options?.mediaAutomationMode === "unattended-apply") {
    results.push(await planMediaProcessing(page, config, options))
  }

  return results
}

export const saveOrSubmit = async (page: Page, options: RunnerOptions) => {
  const config = loadSelectorConfig(options.selectorConfig)
  const targetSurface = await inspectDianxiaomiTargetSurface(page, config)

  if (!targetSurfaceCanWrite(targetSurface)) {
    return stepResult(
      "write-blocked-wrong-surface",
      "Write blocked",
      "failed",
      "Save/submit was blocked because the current page is not a recognized Dianxiaomi listing edit surface",
      targetSurface.data
    )
  }

  if (options.review) {
    return stepResult("review-hold", "人工审核停靠", "skipped", "已进入审核停靠模式，未保存草稿或提交")
  }

  if (options.submit) {
    return submitListingWithVerification(page, config, options)
  }

  if (false && options.submit) {
    const clicked = await clickByKeywords(page, ["发布", "提交", "立即刊登", "submit", "publish"], config.buttons?.submit)
    console.log(clicked ? "已点击发布/提交按钮" : "未找到发布/提交按钮")
    return stepResult(
      "submit-listing",
      "发布/提交",
      clicked ? "done" : "failed",
      clicked ? "已点击发布/提交按钮" : "未找到发布/提交按钮"
    )
  }

  if (options.saveDraft) {
    const clicked = await clickByKeywords(page, ["保存草稿", "保存", "暂存", "save draft", "save"], config.buttons?.save)
    console.log(clicked ? "已点击保存草稿按钮" : "未找到保存草稿按钮，已停留在当前页面等待人工确认")
    return stepResult(
      "save-draft",
      "保存草稿",
      clicked ? "done" : "failed",
      clicked ? "已点击保存草稿按钮" : "未找到保存草稿按钮，已停留在当前页面等待人工确认"
    )
  }

  return stepResult("save-draft", "保存草稿", "skipped", "已按参数跳过保存草稿")
}
