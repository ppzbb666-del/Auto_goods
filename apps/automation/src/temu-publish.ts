import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { chromium, type BrowserContext, type Page } from "playwright"
import type { DianxiaomiRepairPreviewFile } from "@temu-ai-ops/shared"
import {
  ensureDirectory,
  getOptions,
  loadTask,
  waitForManualLoginIfNeeded,
  type RunnerOptions
} from "./common"
import {
  type AutomationStepResult,
  applyRepairPlan,
  fillDraft,
  inspectRepairPlanPreview,
  inspectPublishSurface,
  saveOrSubmit,
  waitForPublishPage
} from "./adapters/dianxiaomi-adapter"
import { loadSelectorConfig } from "./selector-config"

const captureArtifacts = async (page: Page, screenshotDir: string, name: string) => {
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
    console.log(`Saved screenshot: ${screenshotPath}`)
    return screenshotPath
  } catch (fullPageError) {
    const message = fullPageError instanceof Error ? fullPageError.message : String(fullPageError)
    console.warn(`full-page screenshot failed: ${message}`)
  }

  try {
    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
      animations: "disabled",
      caret: "hide",
      timeout: 5_000
    })
    console.log(`Saved screenshot: ${screenshotPath}`)
    return screenshotPath
  } catch (viewportError) {
    const message = viewportError instanceof Error ? viewportError.message : String(viewportError)
    writeFileSync(screenshotNotePath, [
      "Screenshot capture failed.",
      `target: ${screenshotPath}`,
      `reason: ${message}`
    ].join("\n"), "utf8")
    console.warn(`screenshot capture failed, wrote note: ${screenshotNotePath}`)
    return screenshotNotePath
  }
}

type ExecutionReport = {
  id: string
  taskId: string
  taskTitle: string
  platform: string
  pageUrl: string
  pageTitle: string
  status: "completed" | "partial" | "failed"
  createdAt: string
  screenshotPath: string
  steps: AutomationStepResult[]
}

const getReportStatus = (steps: AutomationStepResult[]): ExecutionReport["status"] => {
  const failedCount = steps.filter((step) => step.status === "failed").length
  const doneCount = steps.filter((step) => step.status === "done").length

  if (failedCount === 0 && doneCount > 0) {
    return "completed"
  }

  if (doneCount > 0) {
    return "partial"
  }

  return "failed"
}

const saveExecutionReport = (options: RunnerOptions, report: ExecutionReport) => {
  ensureDirectory(options.screenshotDir)
  const reportPath = path.join(options.screenshotDir, `${report.id}.json`)
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8")
  console.log(`Saved execution report: ${reportPath}`)
  return reportPath
}

const loadRepairPreviewFile = (repairPlanFile: string): DianxiaomiRepairPreviewFile => {
  const absolutePath = path.isAbsolute(repairPlanFile) ? repairPlanFile : path.resolve(repairPlanFile)
  if (!existsSync(absolutePath)) {
    throw new Error(`repair plan file does not exist: ${repairPlanFile}`)
  }

  const parsed = JSON.parse(readFileSync(absolutePath, "utf8")) as DianxiaomiRepairPreviewFile
  if (!parsed.workItemId || !parsed.repairPlan?.actions) {
    throw new Error(`repair plan file is invalid: ${repairPlanFile}`)
  }

  return parsed
}

const shouldUseRepairPlanExecution = (options: RunnerOptions) =>
  Boolean(
    options.repairPlanFile
    && (
      options.repairMode === "apply"
      || (options.dryRun && !options.review && !options.saveDraft && !options.submit)
    )
  )

const runDianxiaomiFlow = async (context: BrowserContext, options: RunnerOptions) => {
  const task = await loadTask(options)
  const repairPreview = shouldUseRepairPlanExecution(options) && options.repairPlanFile
    ? loadRepairPreviewFile(options.repairPlanFile)
    : null
  const selectorConfig = loadSelectorConfig(options.selectorConfig)
  console.log(`Loaded task: ${task.id} - ${task.product.title}`)

  const page = await context.newPage()
  page.setDefaultTimeout(15_000)

  console.log(`Opening page: ${options.targetUrl}`)
  await page.goto(options.targetUrl, {
    waitUntil: "domcontentloaded"
  })
  const steps: AutomationStepResult[] = []

  try {
    await waitForManualLoginIfNeeded(page)
    await waitForPublishPage(page, selectorConfig, {
      waitForManualNavigation: !options.dryRun
    })

    if (repairPreview) {
      if (options.repairMode === "apply") {
        steps.push(...await applyRepairPlan(page, task.draft, repairPreview.repairPlan, selectorConfig, options))
      } else {
        steps.push(...await inspectRepairPlanPreview(page, task.draft, repairPreview.repairPlan, selectorConfig))
      }
    } else if (options.dryRun) {
      steps.push(...await inspectPublishSurface(page, task.draft, selectorConfig, options))
    } else {
      steps.push(...await fillDraft(page, task.draft, selectorConfig, options))
      const writeBlocked = steps.some((step) => step.id.startsWith("write-blocked-") && step.status === "failed")
      if (!writeBlocked) {
        steps.push(await saveOrSubmit(page, options))
      }
    }

    const runKind = repairPreview
      ? options.repairMode === "apply" ? "repair-apply" : "repair-preview"
      : options.dryRun ? "dry-run" : "run"
    const screenshotPath = await captureArtifacts(
      page,
      options.screenshotDir,
      runKind === "repair-apply"
        ? "dianxiaomi-repair-apply"
        : runKind === "repair-preview"
          ? "dianxiaomi-repair-preview"
          : runKind === "dry-run"
            ? "dianxiaomi-dry-run"
            : "dianxiaomi-filled"
    )
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")

    saveExecutionReport(options, {
      id: `dianxiaomi-${runKind}-${timestamp}`,
      taskId: task.id,
      taskTitle: task.product.title,
      platform: options.platform,
      pageUrl: page.url(),
      pageTitle: await page.title(),
      status: getReportStatus(steps),
      createdAt: new Date().toISOString(),
      screenshotPath,
      steps
    })
  } catch (error) {
    const screenshotPath = await captureArtifacts(page, options.screenshotDir, "dianxiaomi-error")
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const message = error instanceof Error ? error.message : String(error)

    steps.push({
      id: "runtime-error",
      label: "Runtime error",
      status: "failed",
      detail: message
    })

    saveExecutionReport(options, {
      id: `dianxiaomi-error-${timestamp}`,
      taskId: task.id,
      taskTitle: task.product.title,
      platform: options.platform,
      pageUrl: page.url(),
      pageTitle: await page.title().catch(() => ""),
      status: "failed",
      createdAt: new Date().toISOString(),
      screenshotPath,
      steps
    })

    throw error
  }
}

const main = async () => {
  const options = getOptions()
  ensureDirectory(options.profileDir)
  ensureDirectory(options.screenshotDir)

  if (options.platform !== "dianxiaomi") {
    throw new Error("This runner currently supports Dianxiaomi only. Use platform=dianxiaomi.")
  }

  const context = await chromium.launchPersistentContext(options.profileDir, {
    headless: !options.headed,
    slowMo: options.slowMo,
    viewport: {
      width: 1440,
      height: 960
    }
  })

  try {
    await runDianxiaomiFlow(context, options)
  } finally {
    if (!options.headed) {
      await context.close()
    } else {
      console.log("Headed mode keeps the browser open. Close it manually after verification.")
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
