import { strict as assert } from "node:assert"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

// 覆盖 POD Studio 两个 AI 代理端点在"未配置 key"下的降级路径，以及 zod 校验路径。
// 真实上游调用需要密钥,不进单测（走手动 / 烟测）。这里通过在子进程 env 里把
// AI_*_API_KEY 置空来覆盖 apps/server/.env（dotenv 不覆盖已存在的 env 变量）。

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const testRoot = path.join(
  tmpdir(),
  `temu-ai-ops-ai-generation-route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
)
const port = 19_500 + Math.floor(Math.random() * 1_000)
const baseUrl = `http://127.0.0.1:${port}`

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const requestRaw = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init)
  const text = await response.text()
  let body: { message?: string } = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { message: text }
  }
  return { status: response.status, body }
}

const postJson = (pathname: string, payload: unknown) =>
  requestRaw(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  })

const startServer = () => {
  const tsxCliPath = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs")
  assert(existsSync(tsxCliPath), `tsx CLI not found: ${tsxCliPath}`)

  return spawn(process.execPath, [tsxCliPath, path.join(repoRoot, "apps/server/src/index.ts")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      // 置空 AI 密钥 -> 端点走 503 降级
      AI_IMAGE_API_KEY: "",
      AI_COPY_API_KEY: "",
      // 隔离状态文件,避免污染真实 .runtime
      QUEUE_DAEMON_STATE_PATH: path.join(testRoot, "queue-daemon-state.json"),
      RECOVERY_RUN_HISTORY_PATH: path.join(testRoot, "recovery-runs.json"),
      PLANNER_STATE_PATH: path.join(testRoot, "planner-state.json"),
      TASK_EXPORT_HISTORY_PATH: path.join(testRoot, "automation-task-exports.json"),
      SELECTOR_DIAGNOSIS_DIRS: path.join(testRoot, "selector-diagnoses")
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  })
}

const stopServer = async (server: ChildProcessWithoutNullStreams) => {
  if (server.exitCode !== null || server.signalCode !== null) {
    return
  }
  server.kill()
  await new Promise<void>((resolve) => {
    server.once("exit", () => resolve())
    setTimeout(resolve, 3_000)
  })
}

const waitForHealth = async (server: ChildProcessWithoutNullStreams, logs: string[]) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`server exited before health check passed: ${logs.join("\n")}`)
    }
    try {
      const health = await requestRaw(`${baseUrl}/health`)
      if (health.status === 200) {
        return
      }
    } catch {
      // 继续轮询
    }
    await sleep(200)
  }
  throw new Error(`server did not become healthy at ${baseUrl}: ${logs.join("\n")}`)
}

rmSync(testRoot, { recursive: true, force: true })
mkdirSync(testRoot, { recursive: true })

const server = startServer()
const logs: string[] = []
server.stdout.on("data", (chunk) => logs.push(String(chunk)))
server.stderr.on("data", (chunk) => logs.push(String(chunk)))

try {
  await waitForHealth(server, logs)

  // 未配置 key -> 503 降级,且带明确 message
  const imageNoKey = await postJson("/pod/ai/image", { prompt: "a retro sunset badge" })
  assert.equal(imageNoKey.status, 503, `no-key image route should return 503, got ${imageNoKey.status}`)
  assert(
    typeof imageNoKey.body.message === "string" && imageNoKey.body.message.includes("AI_IMAGE_API_KEY"),
    `503 image body should name the missing key: ${JSON.stringify(imageNoKey.body)}`
  )

  const copyNoKey = await postJson("/pod/ai/copy", { prompt: "a retro sunset badge" })
  assert.equal(copyNoKey.status, 503, `no-key copy route should return 503, got ${copyNoKey.status}`)
  assert(
    typeof copyNoKey.body.message === "string" && copyNoKey.body.message.includes("AI_COPY_API_KEY"),
    `503 copy body should name the missing key: ${JSON.stringify(copyNoKey.body)}`
  )

  // 空 prompt -> zod 校验失败,返回非 2xx
  const imageBadInput = await postJson("/pod/ai/image", {})
  assert(imageBadInput.status >= 400, `empty-prompt image route should reject, got ${imageBadInput.status}`)

  const copyBadInput = await postJson("/pod/ai/copy", { prompt: "" })
  assert(copyBadInput.status >= 400, `empty-prompt copy route should reject, got ${copyBadInput.status}`)
} finally {
  await stopServer(server)
}

console.log("ai generation route tests passed")
