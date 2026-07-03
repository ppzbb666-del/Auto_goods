import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { SelectorDiagnosisReport } from "@temu-ai-ops/shared"
import {
  DEFAULT_SCREENSHOT_DIR,
  DEFAULT_SELECTOR_CONFIG_PATH,
  ensureDirectory,
  getArgValue,
  parseBoolean,
  resolveRepoPath
} from "./common"
import type { DianxiaomiSelectorConfig } from "./selector-config"

const findLatestDiagnosisPath = (directory: string) => {
  if (!existsSync(directory)) {
    return null
  }

  const fileName = readdirSync(directory)
    .filter((file) => /^dianxiaomi-diagnosis-.*\.json$/.test(file))
    .sort()
    .at(-1)

  return fileName ? path.join(directory, fileName) : null
}

const firstSelector = (report: SelectorDiagnosisReport, group: "fields" | "buttons", key: string) =>
  report[group][key]?.candidates[0]?.selectorHint

const MEDIA_TOOL_KEYS = ["imageTranslation", "whiteBackground", "imageEditor", "batchResize", "imageManagement"] as const
type MediaToolKey = typeof MEDIA_TOOL_KEYS[number]
type FieldConfigKey = keyof NonNullable<DianxiaomiSelectorConfig["fields"]>

const diagnosisSurfaceStatus = (report: SelectorDiagnosisReport) =>
  String(report.targetSurface?.data?.surfaceStatus ?? "unknown")

const isUsableRealDianxiaomiDiagnosis = (report: SelectorDiagnosisReport) => {
  const data = report.targetSurface?.data ?? {}
  return diagnosisSurfaceStatus(report) === "real-dianxiaomi"
    && data.isDianxiaomiHost === true
    && data.isDataFixture !== true
    && report.targetSurface?.status !== "failed"
    && data.canInspect !== false
}

const mediaToolSelectorForConfig = (report: SelectorDiagnosisReport, key: MediaToolKey) => {
  const selector = report.mediaTools?.[key]?.candidates[0]?.selectorHint
  if (!selector) {
    return []
  }

  if (!isUsableRealDianxiaomiDiagnosis(report)) {
    return [selector]
  }

  // P0-D: instant-action tools (image-translation, image-management) do not
  // open a closeable dialog, so the `sampled` gate is too strict for them.
  // Allow either `sampled` (dialog-based apply path) or
  // `instant-action-recognized` (instant apply path) to emit the entry selector.
  const sampled = report.mediaActionSampling?.tools.some((tool) =>
    tool.configKey === key
    && (tool.status === "sampled" || tool.status === "instant-action-recognized")
  )
  return sampled ? [selector] : []
}

const mediaToolActionSelectorForConfig = (
  report: SelectorDiagnosisReport,
  action: "apply" | "close",
  key: MediaToolKey
) => {
  const selector = report.mediaToolActions?.[action]?.[key]?.candidates[0]?.selectorHint
  if (!selector) {
    return []
  }

  if (!isUsableRealDianxiaomiDiagnosis(report)) {
    return [selector]
  }

  const sampled = report.mediaActionSampling?.tools.some((tool) => tool.configKey === key && tool.status === "sampled")
  return sampled ? [selector] : []
}

const fieldStatusForLog = (report: SelectorDiagnosisReport, config: DianxiaomiSelectorConfig, key: FieldConfigKey) => {
  if (config.fields?.[key]?.length) {
    return "ok"
  }

  if (key === "description" && report.fields.description?.data?.descriptionMode === "module-preview") {
    return "preserved"
  }

  return "missing"
}

const mediaToolStatusForLog = (report: SelectorDiagnosisReport, config: DianxiaomiSelectorConfig, key: MediaToolKey) => {
  if (config.mediaTools?.[key]?.length) {
    return "ok"
  }

  const sampled = report.mediaActionSampling?.tools.find((tool) => tool.configKey === key)
  // P0-D: an `instant-action-recognized` tool is now wired through the
  // apply path; mark it as such in the log so operators can tell it apart
  // from the older `instant-action-blocked` outcome.
  if (sampled?.status === "instant-action-blocked") {
    return "instant-blocked"
  }
  if (sampled?.status === "instant-action-recognized") {
    return "instant-recognized"
  }

  if (sampled && sampled.status !== "sampled") {
    return sampled.status
  }

  return report.mediaTools?.[key]?.ok ? "detected-not-promoted" : "missing"
}

const main = () => {
  const screenshotDir = resolveRepoPath(getArgValue("screenshots") ?? process.env.SCREENSHOT_DIR ?? DEFAULT_SCREENSHOT_DIR)
    ?? DEFAULT_SCREENSHOT_DIR
  const diagnosisPath = resolveRepoPath(getArgValue("diagnosis")) ?? findLatestDiagnosisPath(screenshotDir)
  const outputPath = resolveRepoPath(getArgValue("output") ?? process.env.SELECTOR_CONFIG ?? DEFAULT_SELECTOR_CONFIG_PATH)
    ?? DEFAULT_SELECTOR_CONFIG_PATH
  const requireRealDianxiaomi = parseBoolean(
    getArgValue("require-real-dianxiaomi") ?? process.env.REQUIRE_REAL_DIANXIAOMI,
    false
  )

  if (!diagnosisPath) {
    throw new Error(`No dianxiaomi diagnosis found in ${screenshotDir}. Run snapshot:diagnose first.`)
  }

  const report = JSON.parse(readFileSync(diagnosisPath, "utf8")) as SelectorDiagnosisReport
  if (requireRealDianxiaomi && !isUsableRealDianxiaomiDiagnosis(report)) {
    throw new Error(`Diagnosis is not a usable real Dianxiaomi listing edit page: ${diagnosisSurfaceStatus(report)}`)
  }

  const config: DianxiaomiSelectorConfig = {
    fields: {
      title: [firstSelector(report, "fields", "title")].filter(Boolean) as string[],
      description: [firstSelector(report, "fields", "description")].filter(Boolean) as string[],
      price: [firstSelector(report, "fields", "price")].filter(Boolean) as string[],
      stock: [firstSelector(report, "fields", "stock")].filter(Boolean) as string[],
      attribute: [firstSelector(report, "fields", "attribute")].filter(Boolean) as string[]
    },
    buttons: {
      save: [firstSelector(report, "buttons", "save")].filter(Boolean) as string[],
      submit: [firstSelector(report, "buttons", "submit")].filter(Boolean) as string[]
    },
    mediaTools: {
      imageTranslation: mediaToolSelectorForConfig(report, "imageTranslation"),
      whiteBackground: mediaToolSelectorForConfig(report, "whiteBackground"),
      imageEditor: mediaToolSelectorForConfig(report, "imageEditor"),
      batchResize: mediaToolSelectorForConfig(report, "batchResize"),
      imageManagement: mediaToolSelectorForConfig(report, "imageManagement")
    },
    mediaToolActions: {
      apply: {
        imageTranslation: mediaToolActionSelectorForConfig(report, "apply", "imageTranslation"),
        whiteBackground: mediaToolActionSelectorForConfig(report, "apply", "whiteBackground"),
        imageEditor: mediaToolActionSelectorForConfig(report, "apply", "imageEditor"),
        batchResize: mediaToolActionSelectorForConfig(report, "apply", "batchResize"),
        imageManagement: mediaToolActionSelectorForConfig(report, "apply", "imageManagement")
      },
      close: {
        imageTranslation: mediaToolActionSelectorForConfig(report, "close", "imageTranslation"),
        whiteBackground: mediaToolActionSelectorForConfig(report, "close", "whiteBackground"),
        imageEditor: mediaToolActionSelectorForConfig(report, "close", "imageEditor"),
        batchResize: mediaToolActionSelectorForConfig(report, "close", "batchResize"),
        imageManagement: mediaToolActionSelectorForConfig(report, "close", "imageManagement")
      }
    },
    skuRows: report.skuRows.ok ? ["tr, [role='row'], [class*='sku' i], [class*='table-row' i], [class*='row' i]"] : []
  }

  ensureDirectory(path.dirname(outputPath))
  writeFileSync(outputPath, JSON.stringify(config, null, 2), "utf8")

  console.log(`Diagnosis: ${diagnosisPath}`)
  console.log(`Selector config: ${outputPath}`)
  console.log(`Fields: ${(Object.keys(config.fields ?? {}) as FieldConfigKey[]).map((key) => `${key}=${fieldStatusForLog(report, config, key)}`).join(", ")}`)
  console.log(`Buttons: ${Object.entries(config.buttons ?? {}).map(([key, selectors]) => `${key}=${selectors?.length ? "ok" : "missing"}`).join(", ")}`)
  console.log(`Media tools: ${MEDIA_TOOL_KEYS.map((key) => `${key}=${mediaToolStatusForLog(report, config, key)}`).join(", ")}`)
}

main()
