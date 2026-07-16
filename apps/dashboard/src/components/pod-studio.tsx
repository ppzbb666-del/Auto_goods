import { useEffect, useMemo, useRef, useState } from "react"
import type { AiCopyResult } from "@temu-ai-ops/shared"
import { generatePodCopy, generatePodImage } from "../api"

type PodStudioProps = {
  onBack: () => void
}

type ProductKey = "tshirt" | "hoodie" | "mug" | "tote" | "pillow"
type ViewKey = "hero" | "detail" | "scene"
type BackdropKey = "clean" | "warm" | "contrast"
type FitMode = "contain" | "cover"
type SwatchKey = "white" | "black" | "sand" | "pink" | "sky" | "forest"
type TextureProfile = "cotton" | "fleece" | "ceramic" | "canvas" | "linen"

type Swatch = {
  key: SwatchKey
  label: string
  fill: string
}

type ProductTemplate = {
  key: ProductKey
  label: string
  description: string
  baseScale: number
  texture: TextureProfile
  printArea: {
    x: number
    y: number
    width: number
    height: number
    radius: number
  }
  viewTweaks?: Partial<Record<ViewKey, { scale?: number; rotate?: number; x?: number; y?: number }>>
  drawProduct: (ctx: CanvasRenderingContext2D, swatch: Swatch) => void
}

type PodResult = {
  id: string
  label: string
  fileName: string
  dataUrl: string
  productKey: ProductKey
  swatchKey: SwatchKey
  viewKey: ViewKey
}

type RenderOptions = {
  image: CanvasImageSource
  product: ProductTemplate
  swatch: Swatch
  view: ViewKey
  backdrop: BackdropKey
  fitMode: FitMode
  designScale: number
  designRotation: number
  offsetX: number
  offsetY: number
}

const CANVAS_SIZE = 1800
const MAX_OUTPUTS = 48
const DEMO_DESIGN_SIZE = 1400

// 画布直接操作参数范围（比原滑块更宽，支持自由拖拽/旋转）
const OFFSET_RANGE = 60
const ROTATION_RANGE = 180
const SCALE_MIN = 30
const SCALE_MAX = 200
const ROTATE_HANDLE_GAP = 96 // 旋转把手离选中框顶边的距离（视图局部单位）
const HANDLE_HIT_CSS = 18 // 把手命中半径（CSS 像素）

type DragMode = "move" | "rotate" | "scale"

type DragSession = {
  mode: DragMode
  vp: ViewParams
  area: ProductTemplate["printArea"]
  startPointerX: number
  startPointerY: number
  startCenterX: number
  startCenterY: number
  startScale: number
  startHalfDiagonal: number
}

const VIEW_OPTIONS: Array<{ key: ViewKey; label: string; description: string }> = [
  { key: "hero", label: "主图", description: "干净货架图" },
  { key: "detail", label: "细节图", description: "近景印花图" },
  { key: "scene", label: "场景图", description: "生活方式图" }
]

const BACKDROP_OPTIONS: Array<{ key: BackdropKey; label: string }> = [
  { key: "clean", label: "白底棚拍" },
  { key: "warm", label: "暖调家居" },
  { key: "contrast", label: "冷灰电商" }
]

const SWATCHES: Swatch[] = [
  { key: "white", label: "奶白", fill: "#f4efe7" },
  { key: "black", label: "曜黑", fill: "#24252a" },
  { key: "sand", label: "沙色", fill: "#cfb190" },
  { key: "pink", label: "雾粉", fill: "#d7a2ae" },
  { key: "sky", label: "雾蓝", fill: "#9cb8cf" },
  { key: "forest", label: "松绿", fill: "#51645c" }
]

const VIEW_LAYOUTS: Record<ViewKey, { x: number; y: number; scale: number; rotate: number }> = {
  hero: { x: 900, y: 970, scale: 1.08, rotate: 0 },
  detail: { x: 920, y: 1070, scale: 1.34, rotate: -4 },
  scene: { x: 940, y: 1010, scale: 1.01, rotate: -10 }
}

const QUICK_PRESETS: Array<{
  id: string
  label: string
  summary: string
  products: ProductKey[]
  swatches: SwatchKey[]
  views: ViewKey[]
  backdrop: BackdropKey
}> = [
  {
    id: "apparel",
    label: "服饰 18 图",
    summary: "T 恤 + 连帽衫 / 三色 / 三视图",
    products: ["tshirt", "hoodie"],
    swatches: ["white", "black", "sand"],
    views: ["hero", "detail", "scene"],
    backdrop: "clean"
  },
  {
    id: "gift",
    label: "礼物 12 图",
    summary: "马克杯 + 帆布袋 / 两色 / 三视图",
    products: ["mug", "tote"],
    swatches: ["white", "pink"],
    views: ["hero", "detail", "scene"],
    backdrop: "warm"
  },
  {
    id: "home",
    label: "家居 9 图",
    summary: "抱枕 / 三色 / 三视图",
    products: ["pillow"],
    swatches: ["white", "sand", "sky"],
    views: ["hero", "detail", "scene"],
    backdrop: "contrast"
  }
]

const PRODUCT_TEMPLATES: ProductTemplate[] = [
  {
    key: "tshirt",
    label: "T 恤",
    description: "适合胸前图和卖点主图",
    baseScale: 1,
    texture: "cotton",
    printArea: { x: 0, y: -72, width: 390, height: 340, radius: 18 },
    viewTweaks: {
      detail: { scale: 1.16, y: 54 },
      scene: { rotate: -8, x: -44 }
    },
    drawProduct: drawTShirt
  },
  {
    key: "hoodie",
    label: "连帽衫",
    description: "适合秋冬 POD 主图",
    baseScale: 1.03,
    texture: "fleece",
    printArea: { x: 0, y: -50, width: 390, height: 350, radius: 18 },
    viewTweaks: {
      detail: { scale: 1.2, y: 62 },
      scene: { rotate: -7, x: -26 }
    },
    drawProduct: drawHoodie
  },
  {
    key: "mug",
    label: "马克杯",
    description: "适合礼物场景和杯身印花",
    baseScale: 1.38,
    texture: "ceramic",
    printArea: { x: -8, y: 22, width: 336, height: 228, radius: 28 },
    viewTweaks: {
      detail: { scale: 1.32, y: 132, x: -24, rotate: -9 },
      scene: { rotate: -14, x: 20 }
    },
    drawProduct: drawMug
  },
  {
    key: "tote",
    label: "帆布袋",
    description: "适合大图和生活方式图",
    baseScale: 1.08,
    texture: "canvas",
    printArea: { x: 0, y: 24, width: 356, height: 388, radius: 20 },
    viewTweaks: {
      detail: { scale: 1.22, y: 76 },
      scene: { rotate: -12, x: -18 }
    },
    drawProduct: drawTote
  },
  {
    key: "pillow",
    label: "抱枕",
    description: "适合家居软装 POD 图",
    baseScale: 1.1,
    texture: "linen",
    printArea: { x: 0, y: 0, width: 438, height: 438, radius: 60 },
    viewTweaks: {
      detail: { scale: 1.14, y: 62 },
      scene: { rotate: -11, x: 12 }
    },
    drawProduct: drawPillow
  }
]

const PRODUCT_MAP = Object.fromEntries(PRODUCT_TEMPLATES.map((item) => [item.key, item])) as Record<ProductKey, ProductTemplate>
const SWATCH_MAP = Object.fromEntries(SWATCHES.map((item) => [item.key, item])) as Record<SwatchKey, Swatch>

export function PodStudio({ onBack }: PodStudioProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const demoDesignRef = useRef<HTMLCanvasElement | null>(null)
  const dragRef = useRef<DragSession | null>(null)
  const [activeMode, setActiveMode] = useState<DragMode | null>(null)
  const [previewHover, setPreviewHover] = useState(false)

  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [sourceImage, setSourceImage] = useState<CanvasImageSource | null>(null)
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState("")
  const [sourceMeta, setSourceMeta] = useState<{ width: number; height: number; sizeKb: number } | null>(null)
  const [selectedProducts, setSelectedProducts] = useState<ProductKey[]>(["tshirt", "hoodie", "mug"])
  const [selectedSwatches, setSelectedSwatches] = useState<SwatchKey[]>(["white", "black", "sand"])
  const [selectedViews, setSelectedViews] = useState<ViewKey[]>(["hero", "detail", "scene"])
  const [previewProduct, setPreviewProduct] = useState<ProductKey>("tshirt")
  const [previewSwatch, setPreviewSwatch] = useState<SwatchKey>("white")
  const [previewView, setPreviewView] = useState<ViewKey>("hero")
  const [backdrop, setBackdrop] = useState<BackdropKey>("clean")
  const [fitMode, setFitMode] = useState<FitMode>("contain")
  const [designScale, setDesignScale] = useState(82)
  const [designRotation, setDesignRotation] = useState(0)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(-4)
  const [results, setResults] = useState<PodResult[]>([])
  const [selectedResultId, setSelectedResultId] = useState("")
  const [generatedSignature, setGeneratedSignature] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [useDemoDesign, setUseDemoDesign] = useState(true)
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiImages, setAiImages] = useState<Array<{ id: string; dataUrl: string }>>([])
  const [appliedAiId, setAppliedAiId] = useState("")
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [aiCopy, setAiCopy] = useState<AiCopyResult | null>(null)
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false)
  const [message, setMessage] = useState("先用内置演示图看效果，也可以上传你自己的 PNG / JPG / WebP 设计图。")

  const totalOutputs = selectedProducts.length * selectedSwatches.length * selectedViews.length
  const currentSignature = useMemo(
    () =>
      JSON.stringify({
        file: sourceFile?.name ?? "demo-design",
        useDemoDesign,
        products: selectedProducts,
        swatches: selectedSwatches,
        views: selectedViews,
        backdrop,
        fitMode,
        designScale,
        designRotation,
        offsetX,
        offsetY
      }),
    [backdrop, designRotation, designScale, fitMode, offsetX, offsetY, selectedProducts, selectedSwatches, selectedViews, sourceFile, useDemoDesign]
  )
  const resultsStale = results.length > 0 && generatedSignature !== currentSignature
  const previewSummary = PRODUCT_MAP[previewProduct].label + " / " + SWATCH_MAP[previewSwatch].label + " / " + viewLabel(previewView)
  const activeDesign = useDemoDesign ? (demoDesignRef.current ?? sourceImage) : sourceImage
  const selectedResult = useMemo(
    () => results.find((result) => result.id === selectedResultId) ?? results[0] ?? null,
    [results, selectedResultId]
  )

  useEffect(() => {
    const demo = document.createElement("canvas")
    demo.width = DEMO_DESIGN_SIZE
    demo.height = DEMO_DESIGN_SIZE
    drawDemoDesign(demo)
    demoDesignRef.current = demo
    setSourceImage(demo)
  }, [])

  useEffect(() => {
    if (!selectedProducts.includes(previewProduct)) {
      setPreviewProduct(selectedProducts[0] ?? "tshirt")
    }
  }, [previewProduct, selectedProducts])

  useEffect(() => {
    if (!selectedSwatches.includes(previewSwatch)) {
      setPreviewSwatch(selectedSwatches[0] ?? "white")
    }
  }, [previewSwatch, selectedSwatches])

  useEffect(() => {
    if (!selectedViews.includes(previewView)) {
      setPreviewView(selectedViews[0] ?? "hero")
    }
  }, [previewView, selectedViews])

  useEffect(() => {
    if (results.length === 0) {
      if (selectedResultId) {
        setSelectedResultId("")
      }
      return
    }
    if (!results.some((result) => result.id === selectedResultId)) {
      setSelectedResultId(results[0].id)
    }
  }, [results, selectedResultId])

  useEffect(() => {
    if (!sourceFile) {
      return
    }

    const objectUrl = URL.createObjectURL(sourceFile)
    const image = new Image()

    image.onload = () => {
      setSourceImage(image)
      setSourceMeta({
        width: image.width,
        height: image.height,
        sizeKb: Math.max(1, Math.round(sourceFile.size / 1024))
      })
      setSourcePreviewUrl(objectUrl)
      setUseDemoDesign(false)
      setMessage("设计图已载入。先看样张，确认印花位置和质感后再批量生成。")
    }

    image.onerror = () => {
      setSourceMeta(null)
      setSourcePreviewUrl("")
      setUseDemoDesign(true)
      setSourceImage(demoDesignRef.current)
      setMessage("图片读取失败，已切回内置演示图。")
    }

    image.src = objectUrl

    return () => URL.revokeObjectURL(objectUrl)
  }, [sourceFile])

  useEffect(() => {
    const canvas = previewCanvasRef.current
    if (!canvas || !activeDesign) {
      return
    }

    renderMockupToCanvas(canvas, {
      image: activeDesign,
      product: PRODUCT_MAP[previewProduct],
      swatch: SWATCH_MAP[previewSwatch],
      view: previewView,
      backdrop,
      fitMode,
      designScale,
      designRotation,
      offsetX,
      offsetY
    })
  }, [activeDesign, backdrop, designRotation, designScale, fitMode, offsetX, offsetY, previewProduct, previewSwatch, previewView])

  const canGenerate =
    Boolean(activeDesign)
    && selectedProducts.length > 0
    && selectedSwatches.length > 0
    && selectedViews.length > 0
    && totalOutputs <= MAX_OUTPUTS

  const handleFileSelection = (file?: File | null) => {
    if (!file) {
      return
    }
    if (!file.type.startsWith("image/")) {
      setMessage("只支持图片文件。")
      return
    }
    setSourceFile(file)
    setUseDemoDesign(false)
    setResults([])
    setSelectedResultId("")
    setGeneratedSignature("")
    setMessage("设计图载入中，请先看样张。")
  }

  const toggleSelection = <T,>(value: T, current: T[], setter: (next: T[]) => void) => {
    setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }

  const applyQuickPreset = (presetId: string) => {
    const preset = QUICK_PRESETS.find((item) => item.id === presetId)
    if (!preset) {
      return
    }
    setSelectedProducts(preset.products)
    setSelectedSwatches(preset.swatches)
    setSelectedViews(preset.views)
    setPreviewProduct(preset.products[0])
    setPreviewSwatch(preset.swatches[0])
    setPreviewView(preset.views[0])
    setBackdrop(preset.backdrop)
    setMessage("已切换到 " + preset.label + "。")
  }

  const resetPlacement = () => {
    setDesignScale(82)
    setDesignRotation(0)
    setOffsetX(0)
    setOffsetY(-4)
    setMessage("已重置设计图位置。")
  }

  const switchToDemo = () => {
    if (!demoDesignRef.current) {
      return
    }
    setUseDemoDesign(true)
    setSourceFile(null)
    setSourceImage(demoDesignRef.current)
    setSourcePreviewUrl("")
    setSourceMeta(null)
    setResults([])
    setSelectedResultId("")
    setGeneratedSignature("")
    setMessage("已切回内置演示图。")
  }

  const handleGenerate = () => {
    if (!activeDesign || !canGenerate) {
      return
    }

    setIsGenerating(true)
    const nextResults: PodResult[] = []
    let index = 1

    for (const productKey of selectedProducts) {
      for (const swatchKey of selectedSwatches) {
        for (const viewKey of selectedViews) {
          const canvas = document.createElement("canvas")
          renderMockupToCanvas(canvas, {
            image: activeDesign,
            product: PRODUCT_MAP[productKey],
            swatch: SWATCH_MAP[swatchKey],
            view: viewKey,
            backdrop,
            fitMode,
            designScale,
            designRotation,
            offsetX,
            offsetY
          })

          const fileName =
            "pod-"
            + productKey
            + "-"
            + swatchKey
            + "-"
            + viewKey
            + "-"
            + String(index).padStart(2, "0")
            + ".jpg"

          nextResults.push({
            id: fileName,
            label: PRODUCT_MAP[productKey].label + " / " + SWATCH_MAP[swatchKey].label + " / " + viewLabel(viewKey),
            fileName,
            dataUrl: canvas.toDataURL("image/jpeg", 0.94),
            productKey,
            swatchKey,
            viewKey
          })

          index += 1
        }
      }
    }

    setResults(nextResults)
    setSelectedResultId(nextResults[0]?.id ?? "")
    setGeneratedSignature(currentSignature)
    setIsGenerating(false)
    setMessage("已生成 " + String(nextResults.length) + " 张图片。建议先抽查主图、细节图、场景图各一张再批量下载。")
  }

  const handleDownload = (result: PodResult) => {
    downloadDataUrl(result.dataUrl, result.fileName)
  }

  const handleDownloadAll = async () => {
    for (const result of results) {
      downloadDataUrl(result.dataUrl, result.fileName)
      await new Promise((resolve) => window.setTimeout(resolve, 120))
    }
    setMessage("已触发 " + String(results.length) + " 个下载。浏览器如果拦截了批量下载，需要允许当前站点继续下载。")
  }

  const syncPreviewToResult = (result: PodResult) => {
    setPreviewProduct(result.productKey)
    setPreviewSwatch(result.swatchKey)
    setPreviewView(result.viewKey)
  }

  // 把 AI 生成的图片（同源 base64 dataURL，无 canvas taint）贴成衣服上的图案
  const applyAiImage = (item: { id: string; dataUrl: string }) => {
    const image = new Image()
    image.onload = () => {
      const base64 = item.dataUrl.split(",")[1] ?? ""
      setSourceImage(image)
      setSourceFile(null)
      setSourcePreviewUrl("")
      setSourceMeta({ width: image.width, height: image.height, sizeKb: Math.max(1, Math.round((base64.length * 0.75) / 1024)) })
      setUseDemoDesign(false)
      setResults([])
      setSelectedResultId("")
      setGeneratedSignature("")
      setAppliedAiId(item.id)
      setMessage("已把 AI 图片贴到衣服上，可直接在样张里拖拽 / 旋转，或继续生成。")
    }
    image.onerror = () => setMessage("AI 图片加载失败，请重试。")
    image.src = item.dataUrl
  }

  const handleGenerateImage = async () => {
    const prompt = aiPrompt.trim()
    if (!prompt || isGeneratingImage) {
      return
    }
    setIsGeneratingImage(true)
    setMessage("AI 正在生成图片，请稍候...")
    try {
      const result = await generatePodImage(prompt)
      const item = { id: "ai-" + Date.now(), dataUrl: result.dataUrl }
      setAiImages((prev) => [item, ...prev].slice(0, 24))
      setMessage("已生成 1 张图片。点下方缩略图即可贴到衣服上。")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 生图失败")
    } finally {
      setIsGeneratingImage(false)
    }
  }

  const handleGenerateCopy = async () => {
    const prompt = aiPrompt.trim()
    if (!prompt || isGeneratingCopy) {
      return
    }
    setIsGeneratingCopy(true)
    setMessage("AI 正在生成标题文案...")
    try {
      const result = await generatePodCopy(prompt, PRODUCT_MAP[previewProduct].label)
      setAiCopy(result)
      setMessage("标题文案已生成，可一键复制。")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 文案生成失败")
    } finally {
      setIsGeneratingCopy(false)
    }
  }

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setMessage(label + " 已复制到剪贴板。")
    } catch {
      setMessage("复制失败，请手动选择文本复制。")
    }
  }

  // 选中框几何：把印花区里的设计图边界映射回画布 1800 坐标，供 SVG 叠加层绘制
  const previewProductTemplate = PRODUCT_MAP[previewProduct]
  const previewViewParams = getViewParams(previewProductTemplate, previewView)
  const previewMetrics = activeDesign
    ? getDesignMetrics(previewProductTemplate, activeDesign, fitMode, designScale, offsetX, offsetY)
    : null
  const overlayCorners = previewMetrics
    ? getDesignCorners(previewMetrics, designRotation).map((point) => viewLocalToCanvas(previewViewParams, point.x, point.y))
    : []
  const overlayRotateLocal = previewMetrics ? getRotateHandle(previewMetrics, designRotation, ROTATE_HANDLE_GAP) : null
  const overlayRotate = overlayRotateLocal
    ? viewLocalToCanvas(previewViewParams, overlayRotateLocal.x, overlayRotateLocal.y)
    : null
  const overlayTopMid = overlayCorners.length === 4
    ? { x: (overlayCorners[0].x + overlayCorners[1].x) / 2, y: (overlayCorners[0].y + overlayCorners[1].y) / 2 }
    : null

  const pointerToCanvas = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current
    if (!canvas) {
      return null
    }
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return null
    }
    const ratio = CANVAS_SIZE / rect.width
    return {
      x: (event.clientX - rect.left) * ratio,
      y: (event.clientY - rect.top) * (CANVAS_SIZE / rect.height),
      hitRadius: HANDLE_HIT_CSS * ratio
    }
  }

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeDesign || !previewMetrics) {
      return
    }
    const pt = pointerToCanvas(event)
    if (!pt) {
      return
    }

    let mode: DragMode | null = null
    if (overlayRotate && Math.hypot(overlayRotate.x - pt.x, overlayRotate.y - pt.y) <= pt.hitRadius) {
      mode = "rotate"
    } else if (overlayCorners.some((corner) => Math.hypot(corner.x - pt.x, corner.y - pt.y) <= pt.hitRadius)) {
      mode = "scale"
    } else {
      const local = canvasToViewLocal(previewViewParams, pt.x, pt.y)
      const dr = degToRad(designRotation)
      const relX = local.x - previewMetrics.centerX
      const relY = local.y - previewMetrics.centerY
      const localX = relX * Math.cos(dr) + relY * Math.sin(dr)
      const localY = -relX * Math.sin(dr) + relY * Math.cos(dr)
      if (Math.abs(localX) <= previewMetrics.drawWidth / 2 && Math.abs(localY) <= previewMetrics.drawHeight / 2) {
        mode = "move"
      }
    }
    if (!mode) {
      return
    }

    const local = canvasToViewLocal(previewViewParams, pt.x, pt.y)
    dragRef.current = {
      mode,
      vp: previewViewParams,
      area: previewMetrics.area,
      startPointerX: local.x,
      startPointerY: local.y,
      startCenterX: previewMetrics.centerX,
      startCenterY: previewMetrics.centerY,
      startScale: designScale,
      startHalfDiagonal: Math.hypot(previewMetrics.drawWidth / 2, previewMetrics.drawHeight / 2)
    }
    setActiveMode(mode)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePreviewPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const session = dragRef.current
    if (!session) {
      return
    }
    const pt = pointerToCanvas(event)
    if (!pt) {
      return
    }
    const local = canvasToViewLocal(session.vp, pt.x, pt.y)

    if (session.mode === "move") {
      const nextCenterX = session.startCenterX + (local.x - session.startPointerX)
      const nextCenterY = session.startCenterY + (local.y - session.startPointerY)
      setOffsetX(Math.round(clampNumber((nextCenterX - session.area.x) / session.area.width * 100, -OFFSET_RANGE, OFFSET_RANGE)))
      setOffsetY(Math.round(clampNumber((nextCenterY - session.area.y) / session.area.height * 100, -OFFSET_RANGE, OFFSET_RANGE)))
      return
    }

    if (session.mode === "rotate") {
      const angle = Math.atan2(local.y - session.startCenterY, local.x - session.startCenterX)
      setDesignRotation(Math.round(clampNumber(normalizeDegrees(radToDeg(angle) + 90), -ROTATION_RANGE, ROTATION_RANGE)))
      return
    }

    if (session.startHalfDiagonal < 1) {
      return
    }
    const distance = Math.hypot(local.x - session.startCenterX, local.y - session.startCenterY)
    setDesignScale(Math.round(clampNumber(session.startScale * (distance / session.startHalfDiagonal), SCALE_MIN, SCALE_MAX)))
  }

  const handlePreviewPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) {
      return
    }
    dragRef.current = null
    setActiveMode(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <main className="daily-workspace pod-workspace">
      <section className="daily-console pod-console">
        <div className="daily-console-head">
          <div>
            <p className="eyebrow">POD Studio</p>
            <h1>POD 图片裂变工具</h1>
            <p>先把成图效果打实：默认带一张演示图，方便直接看质感、印花融合和场景层次，再决定要不要换成你自己的设计图。</p>
          </div>
          <strong className="daily-mode-badge">效果优先</strong>
        </div>
        <div className="daily-status-strip pod-summary-strip">
          <div className="daily-metric good">
            <span>已选商品</span>
            <strong>{selectedProducts.length}</strong>
            <small>{selectedProducts.map((item) => PRODUCT_MAP[item].label).join(" / ") || "未选择"}</small>
          </div>
          <div className={"daily-metric " + (totalOutputs > MAX_OUTPUTS ? "bad" : "good")}>
            <span>预计出图</span>
            <strong>{totalOutputs}</strong>
            <small>{totalOutputs > MAX_OUTPUTS ? "单次最多 48 张，请减少组合" : "商品 x 配色 x 视图"}</small>
          </div>
          <div className="daily-metric neutral">
            <span>当前样张</span>
            <strong>{viewLabel(previewView)}</strong>
            <small>{previewSummary}</small>
          </div>
          <div className={"daily-metric " + (resultsStale ? "warn" : results.length > 0 ? "good" : "neutral")}>
            <span>生成状态</span>
            <strong>{results.length > 0 ? String(results.length) + " 张" : "--"}</strong>
            <small>{resultsStale ? "参数已变更，建议重新生成" : results.length > 0 ? "结果可下载" : "尚未生成"}</small>
          </div>
        </div>
        <div className="daily-console-actions">
          <button className="ghost-button" onClick={onBack}>返回</button>
          <button className="ghost-button" onClick={() => inputRef.current?.click()}>上传设计图</button>
          <button className="ghost-button" onClick={switchToDemo}>用演示图</button>
          <button className="ghost-button" onClick={resetPlacement}>重置位置</button>
          <button className="primary-button" onClick={handleGenerate} disabled={!canGenerate || isGenerating}>
            {isGenerating ? "生成中..." : "生成 " + String(totalOutputs) + " 张"}
          </button>
          <button className="ghost-button" onClick={() => void handleDownloadAll()} disabled={results.length === 0}>
            批量下载
          </button>
        </div>
        <p className="daily-message">{message}</p>
      </section>

      <section className="pod-grid">
        <article className="daily-panel">
          <div className="daily-panel-head">
            <strong>设计图</strong>
            <span>{useDemoDesign ? "内置演示图案" : sourceMeta ? sourceMeta.width + "x" + sourceMeta.height + " / " + sourceMeta.sizeKb + " KB" : "建议透明 PNG"}</span>
          </div>
          <input
            ref={inputRef}
            className="pod-file-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => handleFileSelection(event.target.files?.[0] ?? null)}
          />
          <label
            className={"pod-upload-zone " + (isDragging ? "dragging" : "")}
            onDragEnter={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              setIsDragging(false)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragging(false)
              handleFileSelection(event.dataTransfer.files?.[0] ?? null)
            }}
            onClick={() => inputRef.current?.click()}
          >
            {sourcePreviewUrl ? <img src={sourcePreviewUrl} alt="设计图预览" className="pod-source-image" /> : <DemoThumbnail />}
            <div className="pod-upload-copy">
              <strong>{sourcePreviewUrl ? "更换设计图" : useDemoDesign ? "上传你自己的设计图" : "上传设计图"}</strong>
              <span>点击选择，或把图片拖到这里</span>
            </div>
          </label>
          <div className="pod-mini-meta">
            <div>
              <strong>推荐输入</strong>
              <span>透明背景 PNG，长边 2000px 以上</span>
            </div>
            <div>
              <strong>当前适配</strong>
              <span>{fitMode === "contain" ? "完整显示设计图" : "铺满印花区域"}</span>
            </div>
            <div>
              <strong>当前策略</strong>
              <span>先把观感做好，再继续扩导出和自动化</span>
            </div>
          </div>
        </article>

        <article className="daily-panel">
          <div className="daily-panel-head">
            <strong>组合设置</strong>
            <span>先选商品，再选配色和视图</span>
          </div>
          <div className="pod-preset-list">
            {QUICK_PRESETS.map((preset) => (
              <button key={preset.id} className="pod-preset-button" onClick={() => applyQuickPreset(preset.id)}>
                <strong>{preset.label}</strong>
                <span>{preset.summary}</span>
              </button>
            ))}
          </div>
          <div className="pod-control-group">
            <strong>商品模板</strong>
            <div className="pod-chip-list">
              {PRODUCT_TEMPLATES.map((product) => (
                <button
                  key={product.key}
                  className={"pod-chip " + (selectedProducts.includes(product.key) ? "selected" : "")}
                  aria-pressed={selectedProducts.includes(product.key)}
                  onClick={() => toggleSelection(product.key, selectedProducts, setSelectedProducts)}
                >
                  <strong>{product.label}</strong>
                  <span>{product.description}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="pod-control-group">
            <strong>商品配色</strong>
            <div className="pod-swatch-list">
              {SWATCHES.map((swatch) => (
                <button
                  key={swatch.key}
                  className={"pod-swatch-button " + (selectedSwatches.includes(swatch.key) ? "selected" : "")}
                  aria-pressed={selectedSwatches.includes(swatch.key)}
                  onClick={() => toggleSelection(swatch.key, selectedSwatches, setSelectedSwatches)}
                >
                  <span className="pod-swatch-dot" style={{ backgroundColor: swatch.fill }} />
                  <strong>{swatch.label}</strong>
                </button>
              ))}
            </div>
          </div>
          <div className="pod-control-group">
            <strong>输出视图</strong>
            <div className="pod-chip-list pod-chip-list-compact">
              {VIEW_OPTIONS.map((view) => (
                <button
                  key={view.key}
                  className={"pod-chip " + (selectedViews.includes(view.key) ? "selected" : "")}
                  aria-pressed={selectedViews.includes(view.key)}
                  onClick={() => toggleSelection(view.key, selectedViews, setSelectedViews)}
                >
                  <strong>{view.label}</strong>
                  <span>{view.description}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="pod-select-grid">
            <label className="daily-scope-control">
              <span>背景风格</span>
              <select value={backdrop} onChange={(event) => setBackdrop(event.target.value as BackdropKey)}>
                {BACKDROP_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
            </label>
            <label className="daily-scope-control">
              <span>适配方式</span>
              <select value={fitMode} onChange={(event) => setFitMode(event.target.value as FitMode)}>
                <option value="contain">完整显示</option>
                <option value="cover">铺满区域</option>
              </select>
            </label>
          </div>
        </article>

        <article className="daily-panel">
          <div className="daily-panel-head">
            <strong>样张预览</strong>
            <span>{previewSummary}</span>
          </div>
          <div className="pod-select-grid">
            <label className="daily-scope-control">
              <span>预览商品</span>
              <select value={previewProduct} onChange={(event) => setPreviewProduct(event.target.value as ProductKey)}>
                {selectedProducts.map((item) => <option key={item} value={item}>{PRODUCT_MAP[item].label}</option>)}
              </select>
            </label>
            <label className="daily-scope-control">
              <span>预览配色</span>
              <select value={previewSwatch} onChange={(event) => setPreviewSwatch(event.target.value as SwatchKey)}>
                {selectedSwatches.map((item) => <option key={item} value={item}>{SWATCH_MAP[item].label}</option>)}
              </select>
            </label>
            <label className="daily-scope-control">
              <span>预览视图</span>
              <select value={previewView} onChange={(event) => setPreviewView(event.target.value as ViewKey)}>
                {selectedViews.map((item) => <option key={item} value={item}>{viewLabel(item)}</option>)}
              </select>
            </label>
          </div>
          <div className={"pod-preview-stage" + (activeMode ? " pod-preview-stage-" + activeMode : "")}>
            <canvas
              ref={previewCanvasRef}
              className="pod-preview-canvas"
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
              onPointerCancel={handlePreviewPointerUp}
              onPointerEnter={() => setPreviewHover(true)}
              onPointerLeave={() => setPreviewHover(false)}
            />
            {previewMetrics && overlayCorners.length === 4 ? (
              <svg
                className={"pod-preview-overlay" + (previewHover || activeMode ? " visible" : "")}
                viewBox={"0 0 " + CANVAS_SIZE + " " + CANVAS_SIZE}
                preserveAspectRatio="xMidYMid meet"
                aria-hidden="true"
              >
                <polygon className="pod-overlay-box" points={overlayCorners.map((corner) => corner.x + "," + corner.y).join(" ")} />
                {overlayTopMid && overlayRotate ? (
                  <line className="pod-overlay-stem" x1={overlayTopMid.x} y1={overlayTopMid.y} x2={overlayRotate.x} y2={overlayRotate.y} />
                ) : null}
                {overlayRotate ? <circle className="pod-overlay-rotate" cx={overlayRotate.x} cy={overlayRotate.y} r={26} /> : null}
                {overlayCorners.map((corner, index) => (
                  <rect key={index} className="pod-overlay-handle" x={corner.x - 22} y={corner.y - 22} width={44} height={44} rx={9} />
                ))}
              </svg>
            ) : null}
            <p className="pod-preview-hint">拖动图案移动 · 拖四角缩放 · 拖顶部圆点旋转</p>
          </div>
          <div className="pod-slider-list">
            <label>
              <span>设计缩放 {designScale}%</span>
              <input type="range" min={SCALE_MIN} max={SCALE_MAX} value={designScale} onChange={(event) => setDesignScale(Number(event.target.value))} />
            </label>
            <label>
              <span>旋转角度 {designRotation}°</span>
              <input type="range" min={-ROTATION_RANGE} max={ROTATION_RANGE} value={designRotation} onChange={(event) => setDesignRotation(Number(event.target.value))} />
            </label>
            <label>
              <span>左右位移 {offsetX}</span>
              <input type="range" min={-OFFSET_RANGE} max={OFFSET_RANGE} value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} />
            </label>
            <label>
              <span>上下位移 {offsetY}</span>
              <input type="range" min={-OFFSET_RANGE} max={OFFSET_RANGE} value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} />
            </label>
          </div>
        </article>
      </section>

      <section className="daily-panel pod-ai-panel">
        <div className="daily-panel-head">
          <strong>AI 创意生成</strong>
          <span>输入提示词，生成图案与标题文案</span>
        </div>
        <label className="pod-ai-prompt">
          <span>提示词</span>
          <textarea
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            placeholder="例如：a retro sunset mountain badge, bold typography, vintage print style"
            rows={3}
          />
        </label>
        <div className="pod-ai-actions">
          <button className="primary-button" onClick={() => void handleGenerateImage()} disabled={!aiPrompt.trim() || isGeneratingImage}>
            {isGeneratingImage ? "生成图片中..." : "生成图片"}
          </button>
          <button className="ghost-button" onClick={() => void handleGenerateCopy()} disabled={!aiPrompt.trim() || isGeneratingCopy}>
            {isGeneratingCopy ? "生成文案中..." : "生成标题文案"}
          </button>
        </div>
        <div className="pod-ai-body">
          <div className="pod-ai-block">
            <strong className="pod-ai-subhead">生成的图片</strong>
            {aiImages.length > 0 ? (
              <div className="pod-ai-gallery">
                {aiImages.map((item) => (
                  <button
                    key={item.id}
                    className={"pod-ai-thumb " + (appliedAiId === item.id ? "selected" : "")}
                    onClick={() => applyAiImage(item)}
                    aria-pressed={appliedAiId === item.id}
                  >
                    <img src={item.dataUrl} alt="AI 生成图案" />
                    {appliedAiId === item.id ? <span className="pod-ai-thumb-badge">已贴到衣服</span> : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="pod-ai-empty">还没有生成图片。输入提示词点“生成图片”，再点缩略图贴到衣服上。</p>
            )}
          </div>
          <div className="pod-ai-block">
            <strong className="pod-ai-subhead">标题文案</strong>
            {aiCopy ? (
              <div className="pod-ai-copy">
                <div className="pod-ai-copy-title">
                  <p>{aiCopy.title}</p>
                  <button className="ghost-button small-button" onClick={() => void copyText(aiCopy.title, "标题")}>复制标题</button>
                </div>
                {aiCopy.sellingPoints.length > 0 ? (
                  <ul className="pod-ai-points">
                    {aiCopy.sellingPoints.map((point, index) => (
                      <li key={index}>
                        <span>{point}</span>
                        <button className="ghost-button small-button" onClick={() => void copyText(point, "卖点")}>复制</button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="pod-ai-empty">点“生成标题文案”，基于提示词 + 当前商品生成 Temu 英文标题和卖点。</p>
            )}
          </div>
        </div>
      </section>

      <section className="daily-panel">
        <div className="daily-panel-head">
          <strong>输出结果</strong>
          <span>{results.length > 0 ? "共 " + String(results.length) + " 张" : "先生成再下载"}</span>
        </div>
        {resultsStale ? <p className="daily-message">参数已经变更，当前结果还是上一版生成的图片。</p> : null}
        {results.length > 0 ? (
          <div className="pod-results-layout">
            <article className="pod-result-hero">
              {selectedResult ? (
                <>
                  <img src={selectedResult.dataUrl} alt={selectedResult.label} className="pod-result-hero-image" />
                  <div className="pod-result-hero-copy">
                    <div>
                      <strong>{selectedResult.label}</strong>
                      <span>{selectedResult.fileName}</span>
                    </div>
                    <div className="pod-result-hero-actions">
                      <button
                        className="ghost-button small-button"
                        onClick={() => {
                          syncPreviewToResult(selectedResult)
                          setMessage("当前检视图已同步到样张预览。")
                        }}
                      >
                        同步到样张
                      </button>
                      <button className="primary-button small-button" onClick={() => handleDownload(selectedResult)}>
                        下载当前
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
            </article>
            <div className="pod-result-grid">
              {results.map((result) => (
                <article
                  key={result.id}
                  className={"pod-result-card " + (selectedResult?.id === result.id ? "selected" : "")}
                >
                  <button
                    className="pod-result-preview-button"
                    onClick={() => setSelectedResultId(result.id)}
                    aria-pressed={selectedResult?.id === result.id}
                  >
                    <img src={result.dataUrl} alt={result.label} className="pod-result-image" />
                  </button>
                  <div className="pod-result-copy">
                    <strong>{result.label}</strong>
                    <span>{result.fileName}</span>
                  </div>
                  <div className="pod-result-card-actions">
                    <button
                      className="ghost-button small-button"
                      onClick={() => {
                        setSelectedResultId(result.id)
                        syncPreviewToResult(result)
                      }}
                    >
                      查看样张
                    </button>
                    <button className="ghost-button small-button" onClick={() => handleDownload(result)}>下载</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-report">先用演示图看看效果，满意后再上传你自己的设计图。</div>
        )}
      </section>
    </main>
  )
}

function DemoThumbnail() {
  return (
    <div className="pod-demo-thumb" aria-hidden="true">
      <div className="pod-demo-sun" />
      <div className="pod-demo-arch pod-demo-arch-warm" />
      <div className="pod-demo-arch pod-demo-arch-cool" />
      <div className="pod-demo-copy">
        <strong>SUNSET</strong>
        <span>WEEKEND SOCIAL CLUB</span>
      </div>
    </div>
  )
}

function viewLabel(view: ViewKey) {
  return VIEW_OPTIONS.find((item) => item.key === view)?.label ?? view
}

function renderMockupToCanvas(canvas: HTMLCanvasElement, options: RenderOptions) {
  canvas.width = CANVAS_SIZE
  canvas.height = CANVAS_SIZE
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return
  }

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"

  drawBackdrop(ctx, options.backdrop, options.view, options.swatch)

  const { scale, rotation, originX, originY } = getViewParams(options.product, options.view)

  ctx.save()
  ctx.translate(originX, originY)
  ctx.rotate(rotation)
  ctx.scale(scale, scale)
  drawGroundShadow(ctx, options.product.key, options.view)
  options.product.drawProduct(ctx, options.swatch)
  drawDesignLayer(ctx, options)
  overlayTexture(ctx, options.product.texture, options.swatch.fill)
  addProductHighlights(ctx, options.product.key, options.view)
  ctx.restore()

  if (options.view === "scene") {
    addSceneDecor(ctx, options.backdrop)
  }
}

function drawDesignLayer(ctx: CanvasRenderingContext2D, options: RenderOptions) {
  const area = options.product.printArea
  const offsetXPx = area.width * (options.offsetX / 100)
  const offsetYPx = area.height * (options.offsetY / 100)
  const { width: imageWidth, height: imageHeight } = getImageDimensions(options.image)
  const baseScale = options.fitMode === "cover"
    ? Math.max(area.width / imageWidth, area.height / imageHeight)
    : Math.min(area.width / imageWidth, area.height / imageHeight)
  const finalScale = baseScale * (options.designScale / 100)
  const drawWidth = imageWidth * finalScale
  const drawHeight = imageHeight * finalScale

  ctx.save()
  ctx.translate(area.x + offsetXPx, area.y + offsetYPx)
  ctx.rotate(degToRad(options.designRotation))
  traceRoundedRect(ctx, -area.width / 2, -area.height / 2, area.width, area.height, area.radius)
  ctx.clip()

  drawWarpedDesign(ctx, options, drawWidth, drawHeight)

  const verticalFade = ctx.createLinearGradient(0, -area.height / 2, 0, area.height / 2)
  verticalFade.addColorStop(0, alpha("#ffffff", 0.02))
  verticalFade.addColorStop(0.45, alpha("#ffffff", 0))
  verticalFade.addColorStop(1, alpha("#0f172a", 0.08))
  ctx.globalCompositeOperation = "multiply"
  ctx.fillStyle = verticalFade
  ctx.fillRect(-area.width / 2, -area.height / 2, area.width, area.height)

  ctx.globalCompositeOperation = "soft-light"
  for (let index = 0; index < 18; index += 1) {
    const foldY = -area.height / 2 + (index + 0.5) * (area.height / 18)
    ctx.fillStyle = alpha(index % 2 === 0 ? "#ffffff" : "#0f172a", index % 2 === 0 ? 0.035 : 0.022)
    ctx.fillRect(-area.width / 2, foldY, area.width, 8)
  }

  ctx.globalCompositeOperation = "multiply"
  const contour = ctx.createLinearGradient(-area.width / 2, 0, area.width / 2, 0)
  contour.addColorStop(0, alpha("#0f172a", 0.09))
  contour.addColorStop(0.2, alpha("#0f172a", 0.018))
  contour.addColorStop(0.5, alpha("#ffffff", 0))
  contour.addColorStop(0.8, alpha("#0f172a", 0.022))
  contour.addColorStop(1, alpha("#0f172a", 0.1))
  ctx.fillStyle = contour
  ctx.fillRect(-area.width / 2, -area.height / 2, area.width, area.height)

  ctx.globalCompositeOperation = "overlay"
  const radial = ctx.createRadialGradient(-area.width * 0.12, -area.height * 0.18, 24, 0, 0, Math.max(area.width, area.height))
  radial.addColorStop(0, alpha("#ffffff", 0.22))
  radial.addColorStop(1, alpha("#ffffff", 0))
  ctx.fillStyle = radial
  ctx.fillRect(-area.width / 2, -area.height / 2, area.width, area.height)

  ctx.globalCompositeOperation = "soft-light"
  const grain = createPrintNoise(ctx, options.product.texture)
  ctx.fillStyle = grain
  ctx.fillRect(-area.width / 2, -area.height / 2, area.width, area.height)

  ctx.restore()
}

function drawWarpedDesign(
  ctx: CanvasRenderingContext2D,
  options: RenderOptions,
  drawWidth: number,
  drawHeight: number
) {
  const { width: imageWidth, height: imageHeight } = getImageDimensions(options.image)
  const slices: number = options.product.key === "mug" ? 40 : options.product.key === "pillow" ? 26 : 24
  const sliceWidth = drawWidth / slices
  const sourceWidth = imageWidth / slices
  const profile = getPrintWarpProfile(options.product.key)

  ctx.globalAlpha = 0.98
  for (let index = 0; index < slices; index += 1) {
    const normalized = slices === 1 ? 0 : index / (slices - 1)
    const curve = Math.sin((normalized - 0.5) * Math.PI)
    const depth = 1 - Math.abs(curve)
    const targetX = -drawWidth / 2 + index * sliceWidth
    const skewX = curve * profile.xCurve
    const lift = profile.centerLift * depth - profile.edgeDrop * Math.abs(curve)
    const stripHeight = drawHeight * (1 - profile.verticalPinch * Math.abs(curve))
    const targetY = -stripHeight / 2 + lift

    ctx.drawImage(
      options.image,
      sourceWidth * index,
      0,
      sourceWidth,
      imageHeight,
      targetX + skewX,
      targetY,
      sliceWidth + 1.5,
      stripHeight
    )
  }
}

function getPrintWarpProfile(productKey: ProductKey) {
  switch (productKey) {
    case "mug":
      return { xCurve: 12, centerLift: 4, edgeDrop: 8, verticalPinch: 0.14 }
    case "tshirt":
      return { xCurve: 6, centerLift: 6, edgeDrop: 5, verticalPinch: 0.08 }
    case "hoodie":
      return { xCurve: 7, centerLift: 8, edgeDrop: 6, verticalPinch: 0.1 }
    case "tote":
      return { xCurve: 4, centerLift: 3, edgeDrop: 4, verticalPinch: 0.06 }
    case "pillow":
      return { xCurve: 8, centerLift: 7, edgeDrop: 7, verticalPinch: 0.12 }
    default:
      return { xCurve: 4, centerLift: 4, edgeDrop: 4, verticalPinch: 0.06 }
  }
}

function createPrintNoise(ctx: CanvasRenderingContext2D, texture: TextureProfile) {
  const patternCanvas = document.createElement("canvas")
  patternCanvas.width = 96
  patternCanvas.height = 96
  const patternCtx = patternCanvas.getContext("2d")
  if (!patternCtx) {
    return ctx.createLinearGradient(0, 0, 96, 96)
  }

  patternCtx.clearRect(0, 0, patternCanvas.width, patternCanvas.height)
  for (let index = 0; index < 240; index += 1) {
    const x = (index * 17) % patternCanvas.width
    const y = (index * 29) % patternCanvas.height
    const size = texture === "ceramic" ? 1 : texture === "linen" ? 1.6 : 1.2
    patternCtx.fillStyle = index % 3 === 0 ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.05)"
    patternCtx.fillRect(x, y, size, size)
  }

  return ctx.createPattern(patternCanvas, "repeat") ?? ctx.createLinearGradient(0, 0, 96, 96)
}

function drawBackdrop(ctx: CanvasRenderingContext2D, backdrop: BackdropKey, view: ViewKey, swatch: Swatch) {
  const warmTint = mixColors(swatch.fill, "#ffffff", 0.8)
  const floorTint = mixColors(swatch.fill, "#d4dde7", 0.22)

  if (backdrop === "clean") {
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_SIZE)
    gradient.addColorStop(0, "#ffffff")
    gradient.addColorStop(0.6, warmTint)
    gradient.addColorStop(1, "#edf3f8")
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    ctx.fillStyle = alpha(floorTint, 0.3)
    ctx.beginPath()
    ctx.ellipse(900, 1450, view === "detail" ? 380 : 480, 72, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = alpha("#ffffff", 0.5)
    ctx.fillRect(120, 180, 260, 760)
    return
  }

  if (backdrop === "warm") {
    const wall = ctx.createLinearGradient(0, 0, 0, 1080)
    wall.addColorStop(0, "#f5ede6")
    wall.addColorStop(1, "#eadfd3")
    ctx.fillStyle = wall
    ctx.fillRect(0, 0, CANVAS_SIZE, 1080)

    ctx.fillStyle = "#d7c7b8"
    ctx.fillRect(0, 1080, CANVAS_SIZE, 720)

    ctx.fillStyle = alpha("#ffffff", 0.34)
    ctx.fillRect(160, 160, 340, 440)
    ctx.fillStyle = alpha("#b49f8d", 0.2)
    ctx.fillRect(1080, 260, 300, 12)
    ctx.fillRect(1080, 292, 420, 8)
    ctx.fillStyle = alpha("#c7b5a4", 0.24)
    ctx.beginPath()
    ctx.ellipse(980, 1380, 440, 88, 0, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  const gradient = ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  gradient.addColorStop(0, "#edf2f5")
  gradient.addColorStop(0.5, "#fbfcfd")
  gradient.addColorStop(1, "#dce4ec")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

  ctx.fillStyle = "#d4dce5"
  ctx.fillRect(1180, 0, 620, CANVAS_SIZE)
  ctx.fillStyle = alpha("#ffffff", 0.58)
  ctx.fillRect(170, 190, 260, 930)
  ctx.fillStyle = alpha("#b9c5d2", 0.18)
  ctx.fillRect(150, 1260, 1360, 14)
}

function addSceneDecor(ctx: CanvasRenderingContext2D, backdrop: BackdropKey) {
  if (backdrop === "warm") {
    ctx.fillStyle = alpha("#ffffff", 0.38)
    ctx.beginPath()
    ctx.ellipse(260, 360, 104, 104, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = alpha("#c0a88d", 0.32)
    ctx.fillRect(1240, 1180, 120, 230)

    ctx.fillStyle = alpha("#d6e0d0", 0.78)
    ctx.beginPath()
    ctx.moveTo(1240, 1180)
    ctx.quadraticCurveTo(1310, 1020, 1362, 1180)
    ctx.quadraticCurveTo(1320, 1100, 1240, 1180)
    ctx.fill()
    return
  }

  if (backdrop === "contrast") {
    ctx.fillStyle = alpha("#ffffff", 0.22)
    ctx.fillRect(220, 240, 260, 10)
    ctx.fillRect(220, 276, 340, 8)
    return
  }

  ctx.fillStyle = alpha("#ffffff", 0.18)
  ctx.fillRect(150, 150, 260, 10)
  ctx.fillRect(150, 180, 340, 8)
}

function drawGroundShadow(ctx: CanvasRenderingContext2D, productKey: ProductKey, view: ViewKey) {
  const radii = {
    tshirt: view === "detail" ? [340, 54] : [390, 62],
    hoodie: view === "detail" ? [350, 58] : [410, 64],
    mug: view === "detail" ? [250, 48] : [280, 54],
    tote: view === "detail" ? [300, 52] : [344, 58],
    pillow: view === "detail" ? [320, 48] : [360, 56]
  }[productKey]

  const shadow = ctx.createRadialGradient(0, 370, 36, 0, 370, radii[0])
  shadow.addColorStop(0, alpha("#334155", 0.24))
  shadow.addColorStop(1, alpha("#334155", 0))
  ctx.fillStyle = shadow
  ctx.beginPath()
  ctx.ellipse(0, 370, radii[0], radii[1], 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawTShirt(ctx: CanvasRenderingContext2D, swatch: Swatch) {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(-184, -420)
  ctx.lineTo(-366, -268)
  ctx.quadraticCurveTo(-436, -204, -406, -42)
  ctx.lineTo(-324, 390)
  ctx.quadraticCurveTo(-316, 456, -236, 456)
  ctx.lineTo(236, 456)
  ctx.quadraticCurveTo(316, 456, 324, 390)
  ctx.lineTo(406, -42)
  ctx.quadraticCurveTo(436, -204, 366, -268)
  ctx.lineTo(184, -420)
  ctx.quadraticCurveTo(94, -342, 0, -342)
  ctx.quadraticCurveTo(-94, -342, -184, -420)
  ctx.closePath()
  fillSurface(ctx, swatch.fill)
  strokeSurface(ctx, swatch.fill)

  ctx.beginPath()
  ctx.ellipse(0, -350, 98, 50, 0, 0, Math.PI * 2)
  ctx.fillStyle = alpha("#0f172a", 0.14)
  ctx.fill()

  ctx.beginPath()
  ctx.ellipse(0, -360, 82, 34, 0, 0, Math.PI * 2)
  ctx.fillStyle = mixColors(swatch.fill, "#ffffff", 0.72)
  ctx.fill()

  drawGarmentSeams(ctx, [
    [[-220, -282], [-312, -80]],
    [[220, -282], [312, -80]],
    [[-130, 442], [-126, 290]],
    [[130, 442], [126, 290]]
  ])
  ctx.restore()
}

function drawHoodie(ctx: CanvasRenderingContext2D, swatch: Swatch) {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(-184, -430)
  ctx.lineTo(-360, -262)
  ctx.quadraticCurveTo(-432, -192, -406, -38)
  ctx.lineTo(-314, 398)
  ctx.quadraticCurveTo(-298, 466, -220, 466)
  ctx.lineTo(220, 466)
  ctx.quadraticCurveTo(298, 466, 314, 398)
  ctx.lineTo(406, -38)
  ctx.quadraticCurveTo(432, -192, 360, -262)
  ctx.lineTo(184, -430)
  ctx.quadraticCurveTo(96, -348, 0, -348)
  ctx.quadraticCurveTo(-96, -348, -184, -430)
  ctx.closePath()
  fillSurface(ctx, swatch.fill)
  strokeSurface(ctx, swatch.fill)

  ctx.beginPath()
  ctx.moveTo(-166, -356)
  ctx.quadraticCurveTo(-132, -498, 0, -498)
  ctx.quadraticCurveTo(132, -498, 166, -356)
  ctx.quadraticCurveTo(96, -274, 0, -274)
  ctx.quadraticCurveTo(-96, -274, -166, -356)
  ctx.closePath()
  const hoodGradient = ctx.createLinearGradient(0, -500, 0, -266)
  hoodGradient.addColorStop(0, mixColors(swatch.fill, "#ffffff", 0.2))
  hoodGradient.addColorStop(1, mixColors(swatch.fill, "#0f172a", 0.2))
  ctx.fillStyle = hoodGradient
  ctx.fill()

  traceRoundedRect(ctx, -158, 172, 316, 136, 44)
  ctx.fillStyle = alpha(mixColors(swatch.fill, "#111827", 0.08), 0.58)
  ctx.fill()
  ctx.strokeStyle = alpha("#0f172a", 0.12)
  ctx.lineWidth = 6
  ctx.stroke()

  drawGarmentSeams(ctx, [
    [[-30, -256], [-42, -126]],
    [[30, -256], [42, -126]]
  ])
  ctx.restore()
}

function drawMug(ctx: CanvasRenderingContext2D, swatch: Swatch) {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(-244, -188)
  ctx.lineTo(162, -188)
  ctx.quadraticCurveTo(252, -188, 260, -94)
  ctx.lineTo(260, 220)
  ctx.quadraticCurveTo(252, 304, 162, 304)
  ctx.lineTo(-244, 304)
  ctx.quadraticCurveTo(-302, 304, -302, 246)
  ctx.lineTo(-302, -128)
  ctx.quadraticCurveTo(-302, -188, -244, -188)
  ctx.closePath()
  fillSurface(ctx, swatch.fill)
  strokeSurface(ctx, swatch.fill)

  ctx.beginPath()
  ctx.ellipse(-18, -188, 228, 40, 0, 0, Math.PI * 2)
  ctx.fillStyle = alpha("#ffffff", 0.9)
  ctx.fill()
  ctx.strokeStyle = alpha("#0f172a", 0.12)
  ctx.lineWidth = 6
  ctx.stroke()

  const mugGloss = ctx.createLinearGradient(-160, -188, 130, 304)
  mugGloss.addColorStop(0, alpha("#ffffff", 0.4))
  mugGloss.addColorStop(0.45, alpha("#ffffff", 0.04))
  mugGloss.addColorStop(1, alpha("#0f172a", 0.08))
  ctx.fillStyle = mugGloss
  ctx.fillRect(-260, -176, 430, 460)

  ctx.beginPath()
  ctx.moveTo(182, -110)
  ctx.bezierCurveTo(322, -128, 352, 34, 264, 92)
  ctx.bezierCurveTo(350, 162, 314, 332, 166, 286)
  ctx.strokeStyle = alpha(mixColors(swatch.fill, "#111827", 0.4), 0.48)
  ctx.lineWidth = 30
  ctx.lineCap = "round"
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(184, -100)
  ctx.bezierCurveTo(292, -102, 312, 38, 236, 88)
  ctx.bezierCurveTo(312, 144, 286, 260, 178, 240)
  ctx.strokeStyle = alpha("#ffffff", 0.84)
  ctx.lineWidth = 16
  ctx.stroke()
  ctx.restore()
}

function drawTote(ctx: CanvasRenderingContext2D, swatch: Swatch) {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(-262, -136)
  ctx.quadraticCurveTo(-230, -292, -122, -368)
  ctx.quadraticCurveTo(-46, -414, 0, -414)
  ctx.quadraticCurveTo(46, -414, 122, -368)
  ctx.quadraticCurveTo(230, -292, 262, -136)
  ctx.lineTo(220, 390)
  ctx.quadraticCurveTo(214, 456, 146, 456)
  ctx.lineTo(-146, 456)
  ctx.quadraticCurveTo(-214, 456, -220, 390)
  ctx.closePath()
  fillSurface(ctx, swatch.fill)
  strokeSurface(ctx, swatch.fill)

  ctx.strokeStyle = alpha(mixColors(swatch.fill, "#111827", 0.42), 0.44)
  ctx.lineWidth = 22
  ctx.beginPath()
  ctx.moveTo(-126, -124)
  ctx.quadraticCurveTo(-120, -326, -22, -360)
  ctx.moveTo(126, -124)
  ctx.quadraticCurveTo(120, -326, 22, -360)
  ctx.stroke()

  drawGarmentSeams(ctx, [
    [[-214, -22], [-194, 366]],
    [[214, -22], [194, 366]]
  ])
  ctx.restore()
}

function drawPillow(ctx: CanvasRenderingContext2D, swatch: Swatch) {
  ctx.save()
  traceRoundedRect(ctx, -336, -336, 672, 672, 122)
  fillSurface(ctx, swatch.fill)
  strokeSurface(ctx, swatch.fill)

  drawGarmentSeams(ctx, [
    [[-286, -206], [-332, 0]],
    [[-332, 0], [-286, 206]],
    [[286, -206], [332, 0]],
    [[332, 0], [286, 206]]
  ])

  ctx.fillStyle = alpha("#ffffff", 0.16)
  ctx.beginPath()
  ctx.ellipse(-104, -156, 126, 92, -0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function fillSurface(ctx: CanvasRenderingContext2D, fill: string) {
  const gradient = ctx.createLinearGradient(-360, -420, 360, 420)
  gradient.addColorStop(0, mixColors(fill, "#ffffff", 0.26))
  gradient.addColorStop(0.52, fill)
  gradient.addColorStop(1, mixColors(fill, "#0f172a", 0.14))
  ctx.fillStyle = gradient
  ctx.fill()
}

function strokeSurface(ctx: CanvasRenderingContext2D, fill: string) {
  ctx.strokeStyle = alpha(mixColors(fill, "#111827", 0.52), 0.34)
  ctx.lineWidth = 10
  ctx.stroke()
}

function overlayTexture(ctx: CanvasRenderingContext2D, texture: TextureProfile, fill: string) {
  const bounds = {
    cotton: { x: -360, y: -450, width: 720, height: 900, radius: 120 },
    fleece: { x: -360, y: -470, width: 720, height: 940, radius: 130 },
    ceramic: { x: -308, y: -198, width: 590, height: 520, radius: 80 },
    canvas: { x: -280, y: -414, width: 560, height: 860, radius: 90 },
    linen: { x: -344, y: -344, width: 688, height: 688, radius: 120 }
  }[texture]

  ctx.save()
  traceRoundedRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, bounds.radius)
  ctx.clip()

  if (texture === "ceramic") {
    const gloss = ctx.createLinearGradient(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height)
    gloss.addColorStop(0, alpha("#ffffff", 0.2))
    gloss.addColorStop(0.3, alpha("#ffffff", 0.04))
    gloss.addColorStop(1, alpha("#0f172a", 0.1))
    ctx.globalCompositeOperation = "soft-light"
    ctx.fillStyle = gloss
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height)
    ctx.restore()
    return
  }

  ctx.globalCompositeOperation = "multiply"
  for (let row = 0; row < 120; row += 1) {
    const y = bounds.y + row * (bounds.height / 120)
    const alphaValue = texture === "fleece" ? 0.018 : texture === "linen" ? 0.024 : 0.02
    ctx.fillStyle = alpha(row % 2 === 0 ? "#ffffff" : mixColors(fill, "#111827", 0.38), alphaValue)
    ctx.fillRect(bounds.x, y, bounds.width, 3)
  }

  ctx.globalCompositeOperation = "overlay"
  for (let column = 0; column < 100; column += 1) {
    const x = bounds.x + column * (bounds.width / 100)
    ctx.fillStyle = alpha(column % 3 === 0 ? "#ffffff" : "#0f172a", texture === "canvas" ? 0.018 : 0.012)
    ctx.fillRect(x, bounds.y, 2, bounds.height)
  }

  ctx.restore()
}

function addProductHighlights(ctx: CanvasRenderingContext2D, productKey: ProductKey, view: ViewKey) {
  const map = {
    tshirt: { x: -120, y: -250, width: 260, height: 410 },
    hoodie: { x: -130, y: -246, width: 280, height: 450 },
    mug: { x: -170, y: -150, width: 220, height: 380 },
    tote: { x: -110, y: -120, width: 220, height: 420 },
    pillow: { x: -150, y: -140, width: 280, height: 280 }
  }[productKey]

  const opacity = view === "detail" ? 0.18 : 0.12
  const gloss = ctx.createLinearGradient(map.x, map.y, map.x + map.width, map.y + map.height)
  gloss.addColorStop(0, alpha("#ffffff", opacity))
  gloss.addColorStop(0.4, alpha("#ffffff", 0.02))
  gloss.addColorStop(1, alpha("#0f172a", 0.08))
  ctx.fillStyle = gloss
  ctx.fillRect(map.x, map.y, map.width, map.height)
}

function drawGarmentSeams(ctx: CanvasRenderingContext2D, lines: Array<[[number, number], [number, number]]>) {
  ctx.strokeStyle = alpha("#0f172a", 0.11)
  ctx.lineWidth = 6
  ctx.beginPath()
  for (const [[x1, y1], [x2, y2]] of lines) {
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
  }
  ctx.stroke()
}

function drawDemoDesign(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const cx = canvas.width / 2
  const cy = canvas.height / 2

  const glow = ctx.createRadialGradient(cx, cy - 80, 40, cx, cy - 80, 420)
  glow.addColorStop(0, alpha("#ffd27e", 0.52))
  glow.addColorStop(1, alpha("#ffd27e", 0))
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.beginPath()
  ctx.arc(cx, cy - 120, 210, Math.PI, 0)
  ctx.lineWidth = 54
  ctx.strokeStyle = "#f06d5f"
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy - 120, 154, Math.PI, 0)
  ctx.lineWidth = 42
  ctx.strokeStyle = "#ffb347"
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy - 120, 102, Math.PI, 0)
  ctx.lineWidth = 34
  ctx.strokeStyle = "#f7e27d"
  ctx.stroke()

  ctx.fillStyle = "#203043"
  for (let index = 0; index < 6; index += 1) {
    const width = 420 - index * 42
    const height = 18
    const y = cy - 80 + index * 52
    traceRoundedRect(ctx, cx - width / 2, y, width, height, 12)
    ctx.fill()
  }

  ctx.fillStyle = "#17303b"
  const mountain = new Path2D()
  mountain.moveTo(240, 980)
  mountain.lineTo(470, 770)
  mountain.lineTo(660, 930)
  mountain.lineTo(860, 710)
  mountain.lineTo(1130, 980)
  mountain.closePath()
  ctx.fill(mountain)

  ctx.fillStyle = "#1f4353"
  const mountain2 = new Path2D()
  mountain2.moveTo(380, 980)
  mountain2.lineTo(640, 800)
  mountain2.lineTo(800, 920)
  mountain2.lineTo(970, 760)
  mountain2.lineTo(1180, 980)
  mountain2.closePath()
  ctx.fill(mountain2)

  ctx.fillStyle = "#0f172a"
  ctx.font = "900 148px 'Segoe UI'"
  ctx.textAlign = "center"
  ctx.fillText("SUNSET", cx, 1110)
  ctx.font = "700 64px 'Segoe UI'"
  ctx.fillText("WEEKEND SOCIAL CLUB", cx, 1208)

  ctx.strokeStyle = alpha("#0f172a", 0.28)
  ctx.lineWidth = 6
  ctx.strokeText("SUNSET", cx, 1110)
}

function getImageDimensions(image: CanvasImageSource) {
  const width = "width" in image ? Number(image.width) : DEMO_DESIGN_SIZE
  const height = "height" in image ? Number(image.height) : DEMO_DESIGN_SIZE
  return {
    width: Number.isFinite(width) && width > 0 ? width : DEMO_DESIGN_SIZE,
    height: Number.isFinite(height) && height > 0 ? height : DEMO_DESIGN_SIZE
  }
}

function traceRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const boundedRadius = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + boundedRadius, y)
  ctx.lineTo(x + width - boundedRadius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + boundedRadius)
  ctx.lineTo(x + width, y + height - boundedRadius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - boundedRadius, y + height)
  ctx.lineTo(x + boundedRadius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - boundedRadius)
  ctx.lineTo(x, y + boundedRadius)
  ctx.quadraticCurveTo(x, y, x + boundedRadius, y)
  ctx.closePath()
}

function mixColors(base: string, target: string, amount: number) {
  const baseRgb = hexToRgb(base)
  const targetRgb = hexToRgb(target)
  const mix = baseRgb.map((channel, index) => Math.round(channel + (targetRgb[index] - channel) * amount))
  return rgbToHex(mix[0], mix[1], mix[2])
}

function hexToRgb(value: string) {
  const normalized = value.replace("#", "")
  const chunk = normalized.length === 3 ? normalized.split("").map((item) => item + item).join("") : normalized
  const int = Number.parseInt(chunk, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

function rgbToHex(red: number, green: number, blue: number) {
  return "#"
    + red.toString(16).padStart(2, "0")
    + green.toString(16).padStart(2, "0")
    + blue.toString(16).padStart(2, "0")
}

function alpha(color: string, opacity: number) {
  const [red, green, blue] = hexToRgb(color)
  return "rgba(" + red + ", " + green + ", " + blue + ", " + opacity + ")"
}

function degToRad(value: number) {
  return value * (Math.PI / 180)
}

function radToDeg(value: number) {
  return value * (180 / Math.PI)
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeDegrees(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180
}

// 整件商品的视图变换（渲染与鼠标换算共用同一套参数，保证拖拽跟手）
function getViewParams(product: ProductTemplate, view: ViewKey) {
  const baseLayout = VIEW_LAYOUTS[view]
  const tweak = product.viewTweaks?.[view] ?? {}
  return {
    scale: baseLayout.scale * product.baseScale * (tweak.scale ?? 1),
    rotation: degToRad(baseLayout.rotate + (tweak.rotate ?? 0)),
    originX: baseLayout.x + (tweak.x ?? 0),
    originY: baseLayout.y + (tweak.y ?? 0)
  }
}

type ViewParams = ReturnType<typeof getViewParams>

// 印花区内设计图的中心（视图局部坐标）与绘制尺寸
function getDesignMetrics(product: ProductTemplate, image: CanvasImageSource, fitMode: FitMode, designScale: number, offsetX: number, offsetY: number) {
  const area = product.printArea
  const { width: imageWidth, height: imageHeight } = getImageDimensions(image)
  const baseScale = fitMode === "cover"
    ? Math.max(area.width / imageWidth, area.height / imageHeight)
    : Math.min(area.width / imageWidth, area.height / imageHeight)
  const finalScale = baseScale * (designScale / 100)
  return {
    area,
    centerX: area.x + area.width * (offsetX / 100),
    centerY: area.y + area.height * (offsetY / 100),
    drawWidth: imageWidth * finalScale,
    drawHeight: imageHeight * finalScale
  }
}

// 视图局部坐标 -> 画布 1800 坐标
function viewLocalToCanvas(vp: ViewParams, x: number, y: number) {
  const cos = Math.cos(vp.rotation)
  const sin = Math.sin(vp.rotation)
  const sx = x * vp.scale
  const sy = y * vp.scale
  return { x: vp.originX + sx * cos - sy * sin, y: vp.originY + sx * sin + sy * cos }
}

// 画布 1800 坐标 -> 视图局部坐标（拖拽时把鼠标位移换算回印花区）
function canvasToViewLocal(vp: ViewParams, x: number, y: number) {
  const cos = Math.cos(vp.rotation)
  const sin = Math.sin(vp.rotation)
  const dx = x - vp.originX
  const dy = y - vp.originY
  return { x: (dx * cos + dy * sin) / vp.scale, y: (-dx * sin + dy * cos) / vp.scale }
}

type DesignMetrics = ReturnType<typeof getDesignMetrics>

// 选中框四角（视图局部坐标），随设计旋转
function getDesignCorners(metrics: DesignMetrics, designRotation: number) {
  const dr = degToRad(designRotation)
  const cos = Math.cos(dr)
  const sin = Math.sin(dr)
  const hw = metrics.drawWidth / 2
  const hh = metrics.drawHeight / 2
  return ([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as const).map(([dx, dy]) => ({
    x: metrics.centerX + dx * cos - dy * sin,
    y: metrics.centerY + dx * sin + dy * cos
  }))
}

// 旋转把手锚点（选中框上方，视图局部坐标）
function getRotateHandle(metrics: DesignMetrics, designRotation: number, gap: number) {
  const dr = degToRad(designRotation)
  const distance = metrics.drawHeight / 2 + gap
  return {
    x: metrics.centerX + distance * Math.sin(dr),
    y: metrics.centerY - distance * Math.cos(dr)
  }
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement("a")
  link.href = dataUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
}
