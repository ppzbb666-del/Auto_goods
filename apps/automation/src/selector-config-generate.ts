import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { SelectorDiagnosisReport } from "@temu-ai-ops/shared"
import { DEFAULT_SCREENSHOT_DIR, ensureDirectory, getArgValue } from "./common"
import type { DianxiaomiSelectorConfig } from "./selector-config"

const getRepoRoot = () => {
  // selector-config-generate.ts lives at apps/automation/src/; go up 3 levels.
  const currentFile = fileURLToPath(import.meta.url)
  return path.resolve(path.dirname(currentFile), "../../..")
}

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

const main = () => {
  const screenshotDir = getArgValue("screenshots") ?? process.env.SCREENSHOT_DIR ?? DEFAULT_SCREENSHOT_DIR
  const diagnosisPath = getArgValue("diagnosis") ?? findLatestDiagnosisPath(screenshotDir)
  const outputPath = getArgValue("output") ?? path.join(getRepoRoot(), ".runtime/dianxiaomi-selector-config.json")

  if (!diagnosisPath) {
    throw new Error(`No dianxiaomi diagnosis found in ${screenshotDir}. Run snapshot:diagnose first.`)
  }

  const report = JSON.parse(readFileSync(diagnosisPath, "utf8")) as SelectorDiagnosisReport
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
      imageTranslation: [report.mediaTools?.imageTranslation?.candidates[0]?.selectorHint].filter(Boolean) as string[],
      whiteBackground: [report.mediaTools?.whiteBackground?.candidates[0]?.selectorHint].filter(Boolean) as string[],
      imageEditor: [report.mediaTools?.imageEditor?.candidates[0]?.selectorHint].filter(Boolean) as string[],
      batchResize: [report.mediaTools?.batchResize?.candidates[0]?.selectorHint].filter(Boolean) as string[],
      imageManagement: [report.mediaTools?.imageManagement?.candidates[0]?.selectorHint].filter(Boolean) as string[]
    },
    mediaToolActions: {
      apply: {
        imageTranslation: [report.mediaToolActions?.apply?.imageTranslation?.candidates[0]?.selectorHint].filter(Boolean) as string[],
        whiteBackground: [report.mediaToolActions?.apply?.whiteBackground?.candidates[0]?.selectorHint].filter(Boolean) as string[],
        imageEditor: [report.mediaToolActions?.apply?.imageEditor?.candidates[0]?.selectorHint].filter(Boolean) as string[],
        batchResize: [report.mediaToolActions?.apply?.batchResize?.candidates[0]?.selectorHint].filter(Boolean) as string[],
        imageManagement: [report.mediaToolActions?.apply?.imageManagement?.candidates[0]?.selectorHint].filter(Boolean) as string[]
      },
      close: {
        imageTranslation: [report.mediaToolActions?.close?.imageTranslation?.candidates[0]?.selectorHint].filter(Boolean) as string[],
        whiteBackground: [report.mediaToolActions?.close?.whiteBackground?.candidates[0]?.selectorHint].filter(Boolean) as string[],
        imageEditor: [report.mediaToolActions?.close?.imageEditor?.candidates[0]?.selectorHint].filter(Boolean) as string[],
        batchResize: [report.mediaToolActions?.close?.batchResize?.candidates[0]?.selectorHint].filter(Boolean) as string[],
        imageManagement: [report.mediaToolActions?.close?.imageManagement?.candidates[0]?.selectorHint].filter(Boolean) as string[]
      }
    },
    skuRows: report.skuRows.ok ? ["tr, [role='row'], [class*='sku' i], [class*='table-row' i], [class*='row' i]"] : []
  }

  ensureDirectory(path.dirname(outputPath))
  writeFileSync(outputPath, JSON.stringify(config, null, 2), "utf8")

  console.log(`Diagnosis: ${diagnosisPath}`)
  console.log(`Selector config: ${outputPath}`)
  console.log(`Fields: ${Object.entries(config.fields ?? {}).map(([key, selectors]) => `${key}=${selectors?.length ? "ok" : "missing"}`).join(", ")}`)
  console.log(`Buttons: ${Object.entries(config.buttons ?? {}).map(([key, selectors]) => `${key}=${selectors?.length ? "ok" : "missing"}`).join(", ")}`)
  console.log(`Media tools: ${Object.entries(config.mediaTools ?? {}).map(([key, selectors]) => `${key}=${selectors?.length ? "ok" : "missing"}`).join(", ")}`)
}

main()
