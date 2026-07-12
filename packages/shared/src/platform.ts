export type SalesPlatform = "temu" | "tiktok-shop" | "shopee" | "amazon"

export type PublishingChannel =
  | "official-api"
  | "dianxiaomi-browser"
  | "seller-center-browser"
  | "browser-extension"

export type ShopAccountStatus = "active" | "attention" | "disconnected" | "disabled"

export interface ShopAccount {
  id: string
  platform: SalesPlatform
  channel: PublishingChannel
  name: string
  merchantId?: string
  siteCode: string
  shopMode: "cross-border" | "local" | "managed" | "semi-managed"
  status: ShopAccountStatus
  capabilities: Array<"create-draft" | "publish" | "update-price" | "update-stock" | "query-status">
  createdAt: string
  updatedAt: string
}

export interface StandardProductSku {
  id: string
  sellerSku: string
  optionValues: Record<string, string>
  purchasePrice: number
  currency: string
  stock: number
  weightGrams?: number
  barcode?: string
  imageUrl?: string
}

export interface StandardProduct {
  id: string
  source: "1688" | "manual" | "csv" | "erp" | "platform"
  sourceReference?: string
  title: string
  brand?: string
  description?: string
  categoryHint?: string
  attributes: Record<string, string>
  media: {
    mainImageUrl?: string
    imageUrls: string[]
    videoUrls: string[]
  }
  skus: StandardProductSku[]
  compliance: {
    countryOfOrigin?: string
    manufacturer?: string
    certifications: string[]
    warnings: string[]
  }
  createdAt: string
  updatedAt: string
}

export type PlatformListingStatus =
  | "draft"
  | "validation-failed"
  | "ready"
  | "publishing"
  | "under-review"
  | "published"
  | "rejected"
  | "archived"

export interface PlatformListing {
  id: string
  productId: string
  shopAccountId: string
  platform: SalesPlatform
  siteCode: string
  externalId?: string
  status: PlatformListingStatus
  categoryId?: string
  localizedContent: Record<string, unknown>
  platformFields: Record<string, unknown>
  validationIssueIds: string[]
  createdAt: string
  updatedAt: string
}

export type PlatformRuleAuthority = "mandatory" | "recommended" | "observed" | "unverified"

export interface PlatformRuleReference {
  id: string
  platform: SalesPlatform
  siteCode: string
  shopMode?: ShopAccount["shopMode"]
  authority: PlatformRuleAuthority
  sourceUrl?: string
  sourceTitle: string
  effectiveAt?: string
  verifiedAt?: string
  summary: string
}

export interface PublishTarget {
  platform: SalesPlatform
  shopAccountId: string
  channel: PublishingChannel
  siteCode: string
}

export type PlatformIntegrationStage = "production-compatible" | "research" | "planned"

export interface PlatformCapabilityProfile {
  platform: SalesPlatform
  displayName: string
  stage: PlatformIntegrationStage
  channels: PublishingChannel[]
  readEnabled: boolean
  writeEnabled: boolean
  capabilities: Array<"catalog" | "create-draft" | "publish" | "query-status" | "update-price" | "update-stock">
  blockers: string[]
  ruleMatrixPath?: string
  updatedAt: string
}

export type PublishingTaskStatus =
  | "queued"
  | "preparing"
  | "ready"
  | "running"
  | "reviewing"
  | "completed"
  | "failed"

export interface PublishingTaskSummary {
  id: string
  legacyTaskId: string
  productId: string
  productTitle: string
  platform: SalesPlatform
  channel: PublishingChannel
  shopAccountId?: string
  status: PublishingTaskStatus
  progress: {
    completedSteps: number
    totalSteps: number
    percent: number
  }
  risks: {
    low: number
    medium: number
    high: number
  }
  writeEnabled: boolean
  updatedAt: string
  source: "legacy-publish-task"
  readOnly: true
}
