import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { DEFAULT_SCREENSHOT_DIR, ensureDirectory, getArgValue, normalizeText, resolveRepoPath } from "./common"

type SnapshotField = {
  tagName: string
  type: string
  name: string
  placeholder: string
  ariaLabel: string
  valuePreview: string
  labelText?: string
  selectorHint: string
  nearbyText: string
}

type SnapshotButton = {
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

type SnapshotSkuRow = {
  rowText: string
  inputCount: number
}

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
  targetSurface?: {
    id: string
    status: "done" | "failed" | "skipped"
    detail: string
    data?: Record<string, unknown>
  }
  descriptionPreview?: {
    ok: boolean
    mode: "module-preview"
    selectorHint?: string
    textPreview?: string
  }
  fields: SnapshotField[]
  buttons: SnapshotButton[]
  skuRows: SnapshotSkuRow[]
  variantCount?: number
  imageTypeStats?: Partial<Record<"mainImage" | "detailImage" | "skuImage", ImageTypeStatsSnapshot>>
  manualDocument?: ManualDocumentSnapshot
  video?: VideoSnapshot
  sizeChart?: SizeChartSnapshot
  fulfillment?: FulfillmentSnapshot
  mediaActionSampling?: {
    enabled: boolean
    tools: Array<{
      id: string
      configKey: string
      status: "sampled" | "missing-tool" | "no-dialog" | "close-failed" | "failed" | "skipped" | "instant-action-blocked"
      sampledButtonCount: number
      reason: string
      entryText?: string
      error?: string
    }>
  }
}

type Candidate = {
  selectorHint: string
  score: number
  text: string
}

type DiagnosisCheck = {
  ok: boolean
  candidates: Candidate[]
  data?: Record<string, unknown>
}

const FIELD_KEYWORDS = {
  title: ["\u5546\u54c1\u6807\u9898", "\u4ea7\u54c1\u6807\u9898", "\u520a\u767b\u6807\u9898", "\u5e73\u53f0\u6807\u9898", "\u6807\u9898", "title", "name"],
  description: ["\u5546\u54c1\u63cf\u8ff0", "\u4ea7\u54c1\u63cf\u8ff0", "\u8be6\u60c5\u63cf\u8ff0", "\u520a\u767b\u63cf\u8ff0", "\u63cf\u8ff0", "description", "details"],
  price: ["\u7533\u62a5\u4ef7", "\u5efa\u8bae\u552e\u4ef7", "\u520a\u767b\u4ef7", "\u9500\u552e\u4ef7", "\u552e\u4ef7", "\u4ef7\u683c", "price", "sale price"],
  stock: ["\u5e93\u5b58", "\u520a\u767b\u5e93\u5b58", "\u53ef\u552e\u5e93\u5b58", "\u6570\u91cf", "stock", "quantity", "available"],
  attribute: ["\u4ea7\u54c1\u5c5e\u6027", "\u5546\u54c1\u5c5e\u6027", "\u5e73\u53f0\u5c5e\u6027", "\u89c4\u683c", "\u53d8\u79cd", "\u53d8\u4f53", "\u5c5e\u6027", "attribute", "variation", "specification"]
} as const

const BUTTON_KEYWORDS = {
  save: ["\u4fdd\u5b58\u8349\u7a3f", "\u4fdd\u5b58", "\u6682\u5b58", "save draft", "save"],
  submit: ["\u4fdd\u5b58\u5e76\u53d1\u5e03", "\u53d1\u5e03", "\u63d0\u4ea4", "\u7acb\u5373\u520a\u767b", "submit", "publish"]
} as const

const BUTTON_NEGATIVE_KEYWORDS = {
  save: ["\u5e38\u7528\u6a21\u677f", "\u6a21\u677f\u7ba1\u7406"],
  submit: ["\u5f85\u53d1\u5e03", "\u53d1\u5e03\u4e2d", "\u53d1\u5e03\u5931\u8d25", "\u53d1\u5e03\u8bb0\u5f55", "\u520a\u767b\u62a5\u8868", "listing"]
} as const

const MEDIA_TOOL_KEYWORDS = {
  imageTranslation: ["\u56fe\u7247\u7ffb\u8bd1", "\u7ffb\u8bd1\u56fe\u7247", "\u4e00\u952e\u7ffb\u8bd1", "image translation", "translate image", "translate"],
  whiteBackground: ["\u56fe\u7247\u767d\u5e95", "\u767d\u5e95\u56fe", "\u767d\u5e95", "white background", "remove background"],
  imageEditor: ["\u5c0f\u79d8\u7f8e\u56fe", "\u7f8e\u56fe", "\u56fe\u7247\u7f16\u8f91", "image editor", "edit image"],
  batchResize: ["\u6279\u91cf\u6539\u5927\u5c0f", "\u6539\u5927\u5c0f", "\u56fe\u7247\u5927\u5c0f", "resize", "batch resize"],
  imageManagement: ["\u56fe\u7247\u7ba1\u7406", "\u56fe\u7247\u7a7a\u95f4", "\u56fe\u7247\u68c0\u6d4b", "\u68c0\u6d4b\u56fe\u7247", "image management", "image space"]
} as const

const MEDIA_TOOL_ACTION_KEYWORDS = {
  apply: ["\u786e\u5b9a", "\u5e94\u7528", "\u4fdd\u5b58", "\u5f00\u59cb", "\u5b8c\u6210", "confirm", "apply", "save", "start", "use selected", "translate", "resize"],
  close: ["\u5173\u95ed", "\u8fd4\u56de", "\u53d6\u6d88", "\u5b8c\u6210", "close", "back", "return", "cancel", "done", "finish"]
} as const

const scoreText = (text: string, keywords: readonly string[]) => {
  const normalized = normalizeText(text)
  return keywords.reduce((score, keyword) => {
    const normalizedKeyword = normalizeText(keyword)
    return score + (normalized.includes(normalizedKeyword) ? Math.max(normalizedKeyword.length, 1) : 0)
  }, 0)
}

const compactPreview = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 180)

const fieldSearchText = (field: SnapshotField) => [
  field.labelText ?? "",
  field.name,
  field.placeholder,
  field.ariaLabel,
  field.selectorHint,
  field.nearbyText,
  field.valuePreview
].join(" ")

const buttonSearchText = (button: SnapshotButton) => [
  button.text,
  button.type,
  button.ariaLabel ?? "",
  button.title ?? "",
  button.selectorHint,
  button.nearbyText ?? ""
].join(" ")

const buttonDirectSearchText = (button: SnapshotButton) => [
  button.text,
  button.type,
  button.ariaLabel ?? "",
  button.title ?? "",
  button.selectorHint
].join(" ")

const buttonDialogSearchText = (button: SnapshotButton) => [
  button.dialogLabel ?? "",
  button.dialogText ?? ""
].join(" ")

const topFieldCandidates = (
  fields: SnapshotField[],
  keywords: readonly string[],
  kind: keyof typeof FIELD_KEYWORDS
): Candidate[] =>
  fields
    .map((field) => {
      const labelScore = scoreText(field.labelText ?? "", keywords)
      const directScore = scoreText([
        field.name,
        field.placeholder,
        field.ariaLabel,
        field.selectorHint
      ].join(" "), keywords)
      const nearbyScore = scoreText(field.nearbyText, keywords)
      const allowNearbyOnly = kind === "attribute"
      const score = labelScore === 0 && directScore === 0 && !allowNearbyOnly
        ? 0
        : labelScore * 6 + directScore * 3 + Math.min(nearbyScore, 10)
      return {
        selectorHint: field.selectorHint,
        score,
        text: compactPreview(fieldSearchText(field))
      }
    })
    .filter((item) => item.selectorHint && item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)

const topButtonCandidates = (
  buttons: SnapshotButton[],
  keywords: readonly string[],
  negativeKeywords: readonly string[] = [],
  requireDirectMatch = false
): Candidate[] =>
  buttons
    .map((button) => {
      const directText = buttonDirectSearchText(button)
      const directScore = scoreText(directText, keywords)
      const negativeScore = scoreText(directText, negativeKeywords)
      const nearbyScore = scoreText(button.nearbyText ?? "", keywords)
      return {
        selectorHint: button.selectorHint,
        score: negativeScore > 0 || (requireDirectMatch && directScore === 0)
          ? 0
          : directScore * 4 + Math.min(nearbyScore, 4),
        text: compactPreview(buttonSearchText(button))
      }
    })
    .filter((item) => item.selectorHint && item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)

const topMediaActionCandidates = (
  buttons: SnapshotButton[],
  toolKeywords: readonly string[],
  actionKeywords: readonly string[]
): Candidate[] =>
  buttons
    .filter((button) => button.dialogSelectorHint)
    .map((button) => {
      const directText = buttonDirectSearchText(button)
      const dialogText = buttonDialogSearchText(button)
      return {
        selectorHint: button.selectorHint,
        score: scoreText(dialogText, toolKeywords) * 4 + scoreText(directText, actionKeywords) * 3,
        text: compactPreview(buttonSearchText(button))
      }
    })
    .filter((item) => item.selectorHint && item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)

const findLatestSnapshotPath = (directory: string) => {
  if (!existsSync(directory)) {
    return null
  }

  const fileName = readdirSync(directory)
    .filter((file) => /^dianxiaomi-snapshot-.*\.json$/.test(file))
    .sort()
    .at(-1)

  return fileName ? path.join(directory, fileName) : null
}

const loadSnapshot = (snapshotPath: string): DianxiaomiSnapshot =>
  JSON.parse(readFileSync(snapshotPath, "utf8")) as DianxiaomiSnapshot

const diagnoseSnapshot = (snapshot: DianxiaomiSnapshot) => {
  const fields: Record<string, DiagnosisCheck> = Object.fromEntries(
    Object.entries(FIELD_KEYWORDS).map(([kind, keywords]) => {
      const candidates = topFieldCandidates(snapshot.fields, keywords, kind as keyof typeof FIELD_KEYWORDS)
      return [
        kind,
        {
          ok: candidates.length > 0,
          candidates
        }
      ]
    })
  )
  if (!fields.description?.ok && snapshot.descriptionPreview?.ok) {
    fields.description = {
      ok: true,
      candidates: [],
      data: {
        descriptionMode: snapshot.descriptionPreview.mode,
        preservedExistingDescription: true,
        selectorHint: snapshot.descriptionPreview.selectorHint ?? "",
        textPreview: snapshot.descriptionPreview.textPreview ?? ""
      }
    }
  }

  const buttons = Object.fromEntries(
    Object.entries(BUTTON_KEYWORDS).map(([kind, keywords]) => {
      const negativeKeywords = BUTTON_NEGATIVE_KEYWORDS[kind as keyof typeof BUTTON_NEGATIVE_KEYWORDS] ?? []
      const candidates = topButtonCandidates(snapshot.buttons, keywords, negativeKeywords)
      return [
        kind,
        {
          ok: candidates.length > 0,
          candidates
        }
      ]
    })
  )

  const mediaTools = Object.fromEntries(
    Object.entries(MEDIA_TOOL_KEYWORDS).map(([kind, keywords]) => {
      const candidates = topButtonCandidates(snapshot.buttons, keywords, [], true)
      return [
        kind,
        {
          ok: candidates.length > 0,
          candidates
        }
      ]
    })
  )

  const mediaToolActions = Object.fromEntries(
    Object.entries(MEDIA_TOOL_ACTION_KEYWORDS).map(([action, actionKeywords]) => [
      action,
      Object.fromEntries(
        Object.entries(MEDIA_TOOL_KEYWORDS).map(([kind, toolKeywords]) => {
          const candidates = topMediaActionCandidates(snapshot.buttons, toolKeywords, actionKeywords)
          return [
            kind,
            {
              ok: candidates.length > 0,
              candidates
            }
          ]
        })
      )
    ])
  )

  const skuRows = {
    ok: snapshot.skuRows.length > 0,
    count: snapshot.skuRows.length,
    samples: snapshot.skuRows.slice(0, 5)
  }

  const targetSurfaceReady = snapshot.targetSurface?.data?.canInspect !== false && snapshot.targetSurface?.status !== "failed"
  const requiredOk = Boolean(
    targetSurfaceReady &&
    fields.title?.ok &&
    (fields.price?.ok || skuRows.ok) &&
    (fields.stock?.ok || skuRows.ok) &&
    buttons.save?.ok
  )

  return {
    pageUrl: snapshot.pageUrl,
    pageTitle: snapshot.pageTitle,
    createdAt: snapshot.createdAt,
    requiredOk,
    targetSurface: snapshot.targetSurface,
    summary: {
      fieldCount: snapshot.fields.length,
      buttonCount: snapshot.buttons.length,
      mediaToolCount: Object.values(mediaTools).filter((tool) => tool.ok).length,
      skuRowCount: snapshot.skuRows.length
    },
    fields,
    buttons,
    mediaTools,
    mediaToolActions,
    listingMetadata: {
      variantCount: snapshot.variantCount,
      manualDocument: snapshot.manualDocument,
      video: snapshot.video,
      sizeChart: snapshot.sizeChart,
      fulfillment: snapshot.fulfillment
    },
    imageTypeStats: snapshot.imageTypeStats,
    mediaActionSampling: snapshot.mediaActionSampling,
    skuRows
  }
}

const main = () => {
  const screenshotDir = resolveRepoPath(getArgValue("screenshots") ?? process.env.SCREENSHOT_DIR ?? DEFAULT_SCREENSHOT_DIR)
    ?? DEFAULT_SCREENSHOT_DIR
  const snapshotPath = resolveRepoPath(getArgValue("snapshot")) ?? findLatestSnapshotPath(screenshotDir)

  if (!snapshotPath) {
    throw new Error(`No dianxiaomi snapshot found in ${screenshotDir}. Run npm run snapshot --workspace @temu-ai-ops/automation first.`)
  }

  const snapshot = loadSnapshot(snapshotPath)
  const diagnosis = diagnoseSnapshot(snapshot)
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const outputPath = path.join(screenshotDir, `dianxiaomi-diagnosis-${timestamp}.json`)
  ensureDirectory(screenshotDir)
  writeFileSync(outputPath, JSON.stringify(diagnosis, null, 2), "utf8")

  console.log(`Snapshot: ${snapshotPath}`)
  console.log(`Diagnosis: ${outputPath}`)
  console.log(`Target surface: ${diagnosis.targetSurface?.data?.surfaceStatus ?? "unknown"} / ${diagnosis.targetSurface?.status ?? "missing"}`)
  console.log(`Required fields ready: ${diagnosis.requiredOk ? "yes" : "no"}`)
  console.log(`Fields: ${Object.entries(diagnosis.fields).map(([kind, result]) => `${kind}=${result.ok ? "ok" : "missing"}`).join(", ")}`)
  console.log(`Buttons: ${Object.entries(diagnosis.buttons).map(([kind, result]) => `${kind}=${result.ok ? "ok" : "missing"}`).join(", ")}`)
  console.log(`Media tools: ${Object.entries(diagnosis.mediaTools).map(([kind, result]) => `${kind}=${result.ok ? "ok" : "missing"}`).join(", ")}`)
  console.log(`Media apply actions: ${Object.entries(diagnosis.mediaToolActions.apply).map(([kind, result]) => `${kind}=${result.ok ? "ok" : "missing"}`).join(", ")}`)
  console.log(`Media close actions: ${Object.entries(diagnosis.mediaToolActions.close).map(([kind, result]) => `${kind}=${result.ok ? "ok" : "missing"}`).join(", ")}`)
  console.log(`Image type stats: ${Object.entries(diagnosis.imageTypeStats ?? {}).map(([kind, stats]) => `${kind}=${stats.count}`).join(", ") || "missing"}`)
  console.log(`Listing metadata: variantCount=${diagnosis.listingMetadata.variantCount ?? "missing"}, manualDocument=${diagnosis.listingMetadata.manualDocument?.present === true ? "present" : diagnosis.listingMetadata.manualDocument ? "missing" : "n/a"}, video=${diagnosis.listingMetadata.video?.present === true ? "present" : diagnosis.listingMetadata.video ? "missing" : "n/a"}, sizeChart=${diagnosis.listingMetadata.sizeChart?.present === true ? "present" : diagnosis.listingMetadata.sizeChart ? "missing" : "n/a"}, fulfillment=${diagnosis.listingMetadata.fulfillment?.mode ?? "n/a"}`)
  console.log(`SKU rows: ${diagnosis.skuRows.count}`)
}

main()
