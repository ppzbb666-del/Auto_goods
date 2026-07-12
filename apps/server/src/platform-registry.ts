import type { PlatformCapabilityProfile, SalesPlatform } from "@temu-ai-ops/shared"

const UPDATED_AT = "2026-07-12T00:00:00.000Z"

const profiles: PlatformCapabilityProfile[] = [
  {
    platform: "temu",
    displayName: "Temu",
    stage: "production-compatible",
    channels: ["dianxiaomi-browser", "browser-extension"],
    readEnabled: true,
    writeEnabled: true,
    capabilities: ["catalog", "create-draft", "publish", "query-status"],
    blockers: [],
    updatedAt: UPDATED_AT
  },
  {
    platform: "tiktok-shop",
    displayName: "TikTok Shop",
    stage: "research",
    channels: [],
    readEnabled: false,
    writeEnabled: false,
    capabilities: [],
    blockers: [
      "target site and shop mode not selected",
      "developer authorization not configured",
      "official product field matrix not verified",
      "draft adapter not implemented"
    ],
    ruleMatrixPath: "docs/tiktok-shop-rules-matrix.md",
    updatedAt: UPDATED_AT
  },
  {
    platform: "shopee",
    displayName: "Shopee",
    stage: "planned",
    channels: [],
    readEnabled: false,
    writeEnabled: false,
    capabilities: [],
    blockers: ["scheduled after TikTok Shop validation"],
    updatedAt: UPDATED_AT
  },
  {
    platform: "amazon",
    displayName: "Amazon",
    stage: "planned",
    channels: [],
    readEnabled: false,
    writeEnabled: false,
    capabilities: [],
    blockers: ["scheduled after compliance and brand governance mature"],
    updatedAt: UPDATED_AT
  }
]

export const listPlatformCapabilities = (): PlatformCapabilityProfile[] =>
  profiles.map((profile) => ({ ...profile, channels: [...profile.channels], capabilities: [...profile.capabilities], blockers: [...profile.blockers] }))

export const getPlatformCapability = (platform: SalesPlatform): PlatformCapabilityProfile | null =>
  listPlatformCapabilities().find((profile) => profile.platform === platform) ?? null

export const canWritePlatform = (platform: SalesPlatform) => getPlatformCapability(platform)?.writeEnabled === true

export class PlatformWriteDisabledError extends Error {
  readonly code = "PLATFORM_WRITE_DISABLED"
  readonly platform: SalesPlatform
  readonly blockers: string[]

  constructor(platform: SalesPlatform, blockers: string[]) {
    super(`write operations are disabled for platform: ${platform}`)
    this.name = "PlatformWriteDisabledError"
    this.platform = platform
    this.blockers = [...blockers]
  }
}

export const assertPlatformWriteEnabled = (platform: SalesPlatform): PlatformCapabilityProfile => {
  const profile = getPlatformCapability(platform)
  if (!profile || !profile.writeEnabled) {
    throw new PlatformWriteDisabledError(platform, profile?.blockers ?? ["platform is not registered"])
  }
  return profile
}
