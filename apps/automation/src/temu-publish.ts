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
  await page.screenshot({
    path: screenshotPath,
    fullPage: true
  })
  console.log(`已保存截图：${screenshotPath}`)
  return screenshotPath
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
  console.log(`已保存执行报告：${reportPath}`)
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

const runDianxiaomiFlow = async (context: BrowserContext, options: RunnerOptions) => {
  const task = await loadTask(options)
  const repairPreview = options.repairPlanFile ? loadRepairPreviewFile(options.repairPlanFile) : null
  const selectorConfig = loadSelectorConfig(options.selectorConfig)
  console.log(`加载任务：${task.id} - ${task.product.title}`)

  const page = await context.newPage()
  page.setDefaultTimeout(15_000)

  console.log(`打开页面：${options.targetUrl}`)
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

    const runKind = repairPreview ? options.repairMode === "apply" ? "repair-apply" : "repair-preview" : options.dryRun ? "dry-run" : "run"
    const screenshotPath = await captureArtifacts(
      page,
      options.screenshotDir,
      runKind === "repair-apply" ? "dianxiaomi-repair-apply" : runKind === "repair-preview" ? "dianxiaomi-repair-preview" : runKind === "dry-run" ? "dianxiaomi-dry-run" : "dianxiaomi-filled"
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
      label: "运行异常",
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
    throw new Error("当前 runner 仅适配店小秘。请使用默认 platform=dianxiaomi，Temu 适配后续单独补齐。")
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
      console.log("headed 模式下浏览器保持打开，确认完成后可手动关闭。")
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
