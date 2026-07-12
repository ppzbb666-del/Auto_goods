import type { DianxiaomiStoreMetrics, ShopAccount } from "@temu-ai-ops/shared"

const UNKNOWN_TIMESTAMP = "1970-01-01T00:00:00.000Z"

export type ShopAccountSummary = {
  account: ShopAccount
  metrics: DianxiaomiStoreMetrics
  source: "legacy-dianxiaomi-metrics"
  readOnly: true
}

const createLegacyShopId = (metrics: DianxiaomiStoreMetrics, index: number) =>
  metrics.storeId?.trim()
    ? `dianxiaomi:${metrics.storeId.trim()}`
    : metrics.storeName?.trim()
      ? `dianxiaomi-name:${metrics.storeName.trim()}`
      : `dianxiaomi-index:${index}`

export const shopAccountsFromDianxiaomiMetrics = (metricsList: DianxiaomiStoreMetrics[]): ShopAccountSummary[] =>
  metricsList.map((metrics, index) => {
    const attention = metrics.blockedCount + metrics.needsRevisionCount > 0
    return {
      account: {
        id: createLegacyShopId(metrics, index),
        platform: "temu",
        channel: "dianxiaomi-browser",
        name: metrics.storeName?.trim() || `Temu shop ${index + 1}`,
        merchantId: metrics.storeId?.trim() || undefined,
        siteCode: "legacy-unknown",
        shopMode: "semi-managed",
        status: attention ? "attention" : "active",
        capabilities: ["create-draft", "publish", "query-status"],
        createdAt: UNKNOWN_TIMESTAMP,
        updatedAt: UNKNOWN_TIMESTAMP
      },
      metrics: { ...metrics },
      source: "legacy-dianxiaomi-metrics",
      readOnly: true
    }
  })

export const getShopAccountSummary = (summaries: ShopAccountSummary[], accountId: string) =>
  summaries.find((summary) => summary.account.id === accountId) ?? null

