import type { AiCopyResult, AiImageResult } from "@temu-ai-ops/shared"

// POD Studio 的 AI 生图 / 标题文案代理。
// key + base URL 从 process.env 读取（由 index.ts 顶部的 dotenv 从
// apps/server/.env 载入），源码里不落任何密钥。两个网关均按 OpenAI 兼容
// 约定调用：生图 /v1/images/generations，文案 /v1/chat/completions。

// 带 HTTP 状态码的错误，index.ts 直接用它分级返回（503 未配置 / 502 上游失败）。
export class AiGenerationError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = "AiGenerationError"
    this.statusCode = statusCode
  }
}

const readEnv = (name: string) => (process.env[name] ?? "").trim()

// 借鉴 automation-runner.ts 的 webhook URL 校验，拒绝非 http(s) 地址。
const assertHttpUrl = (value: string, label: string) => {
  if (!/^https?:\/\//i.test(value)) {
    throw new AiGenerationError(`${label} 未配置或不是合法的 http(s) 地址`, 503)
  }
  return value.replace(/\/+$/, "")
}

type ImageConfig = { baseUrl: string; apiKey: string; model: string }
type CopyConfig = { baseUrl: string; apiKey: string; model: string }

const getImageConfig = (): ImageConfig => {
  const apiKey = readEnv("AI_IMAGE_API_KEY")
  if (!apiKey) {
    throw new AiGenerationError("生图服务未配置 AI_IMAGE_API_KEY", 503)
  }
  return {
    baseUrl: assertHttpUrl(readEnv("AI_IMAGE_BASE_URL"), "AI_IMAGE_BASE_URL"),
    apiKey,
    model: readEnv("AI_IMAGE_MODEL") || "gpt-image-2"
  }
}

const getCopyConfig = (): CopyConfig => {
  const apiKey = readEnv("AI_COPY_API_KEY")
  if (!apiKey) {
    throw new AiGenerationError("文案服务未配置 AI_COPY_API_KEY", 503)
  }
  return {
    baseUrl: assertHttpUrl(readEnv("AI_COPY_BASE_URL"), "AI_COPY_BASE_URL"),
    apiKey,
    model: readEnv("AI_COPY_MODEL") || "claude-opus-4-6"
  }
}

const readErrorBody = async (response: Response) => {
  const text = await response.text().catch(() => "")
  try {
    const parsed = JSON.parse(text)
    return parsed?.error?.message ?? parsed?.message ?? text
  } catch {
    return text
  }
}

// 远程图片 URL -> base64 dataURL 兜底（当网关只回 url 不回 b64_json 时）。
const remoteImageToDataUrl = async (url: string): Promise<string> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new AiGenerationError(`下载生成图片失败：HTTP ${response.status}`, 502)
  }
  const contentType = response.headers.get("content-type") ?? "image/png"
  const buffer = Buffer.from(await response.arrayBuffer())
  return `data:${contentType};base64,${buffer.toString("base64")}`
}

export const generateAiImage = async (prompt: string): Promise<AiImageResult> => {
  const config = getImageConfig()

  let response: Response
  try {
    response = await fetch(`${config.baseUrl}/v1/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        prompt,
        n: 1,
        size: "1024x1024"
      })
    })
  } catch (error) {
    throw new AiGenerationError(`生图请求失败：${error instanceof Error ? error.message : String(error)}`, 502)
  }

  if (!response.ok) {
    throw new AiGenerationError(`生图上游返回 HTTP ${response.status}：${await readErrorBody(response)}`, 502)
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: Array<{ b64_json?: string; url?: string }>
  } | null
  const item = payload?.data?.[0]
  if (!item) {
    throw new AiGenerationError("生图上游返回结构异常：缺少 data[0]", 502)
  }
  if (item.b64_json) {
    return { dataUrl: `data:image/png;base64,${item.b64_json}` }
  }
  if (item.url) {
    return { dataUrl: await remoteImageToDataUrl(item.url) }
  }
  throw new AiGenerationError("生图上游返回结构异常：既无 b64_json 也无 url", 502)
}

const clampTitle = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 120)

// 从模型返回文本里解析出标题 + 卖点：优先 JSON，失败则按行兜底。
const parseCopyContent = (content: string): AiCopyResult => {
  const stripped = content.replace(/```(?:json)?/gi, "").trim()

  try {
    const parsed = JSON.parse(stripped) as { title?: unknown; sellingPoints?: unknown }
    const title = typeof parsed.title === "string" ? clampTitle(parsed.title) : ""
    const sellingPoints = Array.isArray(parsed.sellingPoints)
      ? parsed.sellingPoints.filter((point): point is string => typeof point === "string").map((point) => point.trim()).filter(Boolean).slice(0, 4)
      : []
    if (title) {
      return { title, sellingPoints }
    }
  } catch {
    // 落到按行兜底
  }

  const lines = stripped
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*\d.)]+\s*)/, "").trim())
    .filter(Boolean)
  if (lines.length === 0) {
    throw new AiGenerationError("文案上游返回内容为空", 502)
  }
  return {
    title: clampTitle(lines[0]),
    sellingPoints: lines.slice(1, 5)
  }
}

export const generateAiCopy = async (prompt: string, product: string): Promise<AiCopyResult> => {
  const config = getCopyConfig()

  const systemPrompt =
    "你是资深 Temu 跨境电商 listing 文案。根据设计主题和商品类型,产出可直接用于 Temu 的英文标题和卖点。" +
    "只输出 JSON,格式为 {\"title\": string, \"sellingPoints\": string[]}。" +
    "title 为英文,不超过 120 字符,不含表情/敏感/品牌词;sellingPoints 为 3-4 条英文短句。"
  const userPrompt = `商品类型：${product}\n设计主题（生图提示词）：${prompt}`

  let response: Response
  try {
    response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    })
  } catch (error) {
    throw new AiGenerationError(`文案请求失败：${error instanceof Error ? error.message : String(error)}`, 502)
  }

  if (!response.ok) {
    throw new AiGenerationError(`文案上游返回 HTTP ${response.status}：${await readErrorBody(response)}`, 502)
  }

  const payload = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>
  } | null
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== "string" || !content.trim()) {
    throw new AiGenerationError("文案上游返回结构异常：缺少 choices[0].message.content", 502)
  }
  return parseCopyContent(content)
}
