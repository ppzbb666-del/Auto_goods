import type {
  PlatformListing,
  PlatformRuleReference,
  PublishTarget,
  SalesPlatform,
  ShopAccount,
  StandardProduct
} from "./platform"

export type PlatformValidationIssue = {
  id: string
  field?: string
  severity: "error" | "warning"
  message: string
  rule?: PlatformRuleReference
}

export type PlatformValidationResult = {
  valid: boolean
  issues: PlatformValidationIssue[]
}

export type PlatformPublishResult = {
  success: boolean
  externalId?: string
  status: PlatformListing["status"]
  message: string
  retryable: boolean
}

export interface PlatformAdapter {
  readonly platform: SalesPlatform
  readonly supportedChannels: PublishTarget["channel"][]

  supports(account: ShopAccount): boolean
  createDraft(product: StandardProduct, target: PublishTarget): Promise<PlatformListing>
  validate(listing: PlatformListing, account: ShopAccount): Promise<PlatformValidationResult>
  publish(listing: PlatformListing, account: ShopAccount): Promise<PlatformPublishResult>
  queryStatus(listing: PlatformListing, account: ShopAccount): Promise<PlatformPublishResult>
}

