import { existsSync, mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { Locator, Page } from "playwright"
import type { PublishTask } from "@temu-ai-ops/shared"

export type Platform = "dianxiaomi" | "temu"
export type MediaAutomationMode = "plan-only" | "unattended-open" | "unattended-apply"
export type RepairMode = "preview" | "apply"

export type RunnerOptions = {
  platform: Platform
  targetUrl: string
  taskApiUrl: string
  taskFile?: string
  repairPlanFile?: string
  profileDir: string
  headed: boolean
  slowMo: number
  saveDraft: boolean
  submit: boolean
  review: boolean
  dryRun: boolean
  repairMode: RepairMode
  screenshotDir: string
  selectorConfig?: string
  mediaAutomationMode: MediaAutomationMode
  mediaAutomationTools: string[]
  sampleMediaActions: boolean
  keepOpen: boolean
  submitMaxAttempts: number
}

export const DEFAULT_DIANXIAOMI_URL = "https://www.dianxiaomi.com/"
export const DEFAULT_TEMU_URL = "https://seller.temu.com/"
export const DEFAULT_TASK_API_URL = "http://localhost:8787/tasks/active?requireApproved=true"
export const EDITABLE_SELECTOR = "input:not([type='hidden']):not([disabled]), textarea:not([disabled]), [contenteditable='true']"
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

export const getRepoRoot = () => REPO_ROOT
export const DEFAULT_SCREENSHOT_DIR = path.join(REPO_ROOT, "output/playwright")
export const DEFAULT_SELECTOR_CONFIG_PATH = path.join(REPO_ROOT, ".runtime/dianxiaomi-selector-config.json")
export const getDefaultProfileDir = (platform: Platform) => path.join(REPO_ROOT, `.runtime/playwright/${platform}-profile`)

export const resolveRepoPath = (value: string | undefined) => {
  const trimmed = value?.trim()
  if (!trimmed) {
    return undefined
  }

  return path.isAbsolute(trimmed) ? trimmed : path.join(REPO_ROOT, trimmed)
}

export const ensureDirectory = (directory: string) => {
  mkdirSync(directory, {
    recursive: true
  })
}

export const normalizeText = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim().toLowerCase()

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) {
    return fallback
  }

  return ["1", "true", "yes", "y", "on"].includes(value.toLowerCase())
}

const parseMediaAutomationMode = (value: string | undefined): MediaAutomationMode => {
  if (value === "unattended-open" || value === "unattended-apply") {
    return value
  }

  return "plan-only"
}

const parseRepairMode = (value: string | undefined): RepairMode => value === "apply" ? "apply" : "preview"

const parseStringList = (value: string | undefined) =>
  (value ?? "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(1, Math.min(10, Math.floor(parsed)))
}

export const getArgValue = (name: string) => {
  const prefix = `--${name}=`
  const matched = process.argv.find((item) => item.startsWith(prefix))
  return matched?.slice(prefix.length)
}

export const parsePlatform = (value: string | undefined): Platform => {
  if (value === "temu") {
    return "temu"
  }

  return "dianxiaomi"
}

export const getOptions = (): RunnerOptions => {
  const platform = parsePlatform(getArgValue("platform") ?? process.env.PLATFORM)
  const defaultUrl = platform === "dianxiaomi" ? DEFAULT_DIANXIAOMI_URL : DEFAULT_TEMU_URL
  const defaultProfileDir = getDefaultProfileDir(platform)

  return {
    platform,
    targetUrl: getArgValue("url") ?? process.env.TEMU_TARGET_URL ?? defaultUrl,
    taskApiUrl: getArgValue("task-api") ?? process.env.TEMU_TASK_API_URL ?? DEFAULT_TASK_API_URL,
    taskFile: resolveRepoPath(getArgValue("task-file") ?? process.env.TEMU_TASK_FILE),
    repairPlanFile: resolveRepoPath(getArgValue("repair-plan-file") ?? process.env.DIANXIAOMI_REPAIR_PLAN_FILE),
    profileDir: resolveRepoPath(getArgValue("profile") ?? process.env.TEMU_PROFILE_DIR ?? defaultProfileDir) ?? defaultProfileDir,
    headed: parseBoolean(getArgValue("headed") ?? process.env.HEADED, true),
    slowMo: Number(getArgValue("slow-mo") ?? process.env.SLOW_MO ?? 80),
    saveDraft: parseBoolean(getArgValue("save-draft") ?? process.env.SAVE_DRAFT, true),
    submit: parseBoolean(getArgValue("submit") ?? process.env.SUBMIT, false),
    review: parseBoolean(getArgValue("review") ?? process.env.REVIEW, false),
    dryRun: parseBoolean(getArgValue("dry-run") ?? process.env.DRY_RUN, false),
    repairMode: parseRepairMode(getArgValue("repair-mode") ?? process.env.DIANXIAOMI_REPAIR_MODE),
    screenshotDir: resolveRepoPath(getArgValue("screenshots") ?? process.env.SCREENSHOT_DIR ?? DEFAULT_SCREENSHOT_DIR) ?? DEFAULT_SCREENSHOT_DIR,
    selectorConfig: resolveRepoPath(getArgValue("selector-config") ?? process.env.SELECTOR_CONFIG ?? DEFAULT_SELECTOR_CONFIG_PATH) ?? DEFAULT_SELECTOR_CONFIG_PATH,
    mediaAutomationMode: parseMediaAutomationMode(getArgValue("media-automation-mode") ?? process.env.MEDIA_AUTOMATION_MODE),
    mediaAutomationTools: parseStringList(getArgValue("media-automation-tools") ?? process.env.MEDIA_AUTOMATION_TOOLS),
    sampleMediaActions: parseBoolean(getArgValue("sample-media-actions") ?? process.env.SAMPLE_MEDIA_ACTIONS, false),
    keepOpen: parseBoolean(getArgValue("keep-open") ?? process.env.KEEP_OPEN, true),
    submitMaxAttempts: parsePositiveInteger(getArgValue("submit-max-attempts") ?? process.env.SUBMIT_MAX_ATTEMPTS, 3)
  }
}

export const firstVisible = async (locators: Locator[]) => {
  for (const locator of locators) {
    const count = await locator.count()

    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index)
      if (await item.isVisible().catch(() => false)) {
        return item
      }
    }
  }

  return null
}

export const loadTaskFromFile = (taskFile: string): PublishTask => {
  if (!existsSync(taskFile)) {
    throw new Error(`任务文件不存在：${taskFile}`)
  }

  return JSON.parse(readFileSync(taskFile, "utf8")) as PublishTask
}

export const fetchActiveTask = async (taskApiUrl: string): Promise<PublishTask> => {
  const response = await fetch(taskApiUrl)

  if (!response.ok) {
    throw new Error(`读取任务失败：${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<PublishTask>
}

export const loadTask = async (options: RunnerOptions) => {
  if (options.taskFile) {
    return loadTaskFromFile(options.taskFile)
  }

  return fetchActiveTask(options.taskApiUrl)
}

export const waitForManualLoginIfNeeded = async (page: Page) => {
  const loginHints = ["登录", "login", "sign in", "验证码", "captcha"]
  const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""))
  const seemsLoginPage = loginHints.some((hint) => bodyText.includes(hint.toLowerCase()))

  if (!seemsLoginPage) {
    return
  }

  console.log("检测到可能需要登录。请在打开的浏览器中手动完成登录，脚本会等待页面离开登录状态。")
  await page.waitForFunction(
    (hints) => {
      const text = document.body?.innerText?.toLowerCase() ?? ""
      return !hints.some((hint) => text.includes(hint))
    },
    loginHints.map((hint) => hint.toLowerCase()),
    {
      timeout: 5 * 60 * 1000
    }
  )
}
