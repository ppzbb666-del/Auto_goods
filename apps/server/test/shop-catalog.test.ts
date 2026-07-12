import assert from "node:assert/strict"
import { getShopAccountSummary, shopAccountsFromDianxiaomiMetrics } from "../src/shop-catalog"

const summaries = shopAccountsFromDianxiaomiMetrics([
  { storeId: "store-1", storeName: "Main", workItemCount: 5, readyCount: 2, collectedCount: 1, blockedCount: 0, needsRevisionCount: 0, editedCount: 2 },
  { storeName: "Needs review", workItemCount: 3, readyCount: 0, collectedCount: 0, blockedCount: 1, needsRevisionCount: 1, editedCount: 1 }
])

assert.equal(summaries[0]?.account.id, "dianxiaomi:store-1")
assert.equal(summaries[0]?.account.platform, "temu")
assert.equal(summaries[0]?.account.channel, "dianxiaomi-browser")
assert.equal(summaries[0]?.account.status, "active")
assert.equal(summaries[1]?.account.status, "attention")
assert.equal(summaries[1]?.account.siteCode, "legacy-unknown")
assert.equal(getShopAccountSummary(summaries, "dianxiaomi:store-1")?.metrics.readyCount, 2)
assert.equal(getShopAccountSummary(summaries, "missing"), null)

summaries[0]!.metrics.readyCount = 99
const fresh = shopAccountsFromDianxiaomiMetrics([
  { storeId: "store-1", storeName: "Main", workItemCount: 5, readyCount: 2, collectedCount: 1, blockedCount: 0, needsRevisionCount: 0, editedCount: 2 }
])
assert.equal(fresh[0]?.metrics.readyCount, 2)

console.log("ALL SHOP CATALOG TESTS PASSED")

