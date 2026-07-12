import type { DianxiaomiProductWorkItem, PublishTask } from "./types"
import type { PlatformListing, StandardProduct } from "./platform"

const normalizeIsoDate = (value?: string) => {
  if (!value) return new Date(0).toISOString()
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date(0).toISOString()
}

export const standardProductFromPublishTask = (task: PublishTask): StandardProduct => ({
  id: task.product.id,
  source: task.product.source === "dianxiaomi" ? "platform" : task.product.source,
  sourceReference: task.product.sourceUrl,
  title: task.product.title,
  description: task.draft.description,
  categoryHint: task.product.category,
  attributes: { ...task.product.attributes },
  media: {
    mainImageUrl: task.product.images[0],
    imageUrls: [...task.product.images],
    videoUrls: []
  },
  skus: task.product.skus.map((sku) => ({
    id: sku.skuId,
    sellerSku: sku.skuId,
    optionValues: { ...sku.attributes },
    purchasePrice: sku.costCny,
    currency: "CNY",
    stock: sku.stock
  })),
  compliance: {
    certifications: [],
    warnings: task.risks.filter((risk) => risk.level === "high").map((risk) => risk.message)
  },
  createdAt: normalizeIsoDate(task.updatedAt),
  updatedAt: normalizeIsoDate(task.updatedAt)
})

export const temuListingFromLegacyTask = (
  task: PublishTask,
  workItem: DianxiaomiProductWorkItem,
  shopAccountId: string
): PlatformListing => ({
  id: `temu-${task.id}`,
  productId: task.product.id,
  shopAccountId,
  platform: "temu",
  siteCode: workItem.snapshot.targetLanguage ?? "en",
  status: workItem.publishOutcome?.status === "succeeded"
    ? "published"
    : workItem.status === "ready-for-automation"
      ? "ready"
      : workItem.status === "blocked" || workItem.status === "needs-revision"
        ? "validation-failed"
        : "draft",
  categoryId: workItem.categoryHint?.categoryId,
  localizedContent: {
    title: task.draft.listingTitle,
    sellingPoints: [...task.draft.sellingPoints],
    description: task.draft.description,
    language: workItem.snapshot.targetLanguage ?? "en"
  },
  platformFields: {
    channel: "dianxiaomi-browser",
    pageUrl: workItem.pageUrl,
    sourceBucket: workItem.sourceBucket,
    categoryPath: [...task.draft.categoryPath],
    attributes: { ...task.draft.attributes },
    skuPricing: task.draft.skuPricing.map((sku) => ({ ...sku, attributes: { ...sku.attributes } }))
  },
  validationIssueIds: workItem.requirements.checks
    .filter((check) => !check.ok)
    .map((check) => check.id),
  createdAt: normalizeIsoDate(workItem.queuedAt),
  updatedAt: normalizeIsoDate(workItem.updatedAt)
})
