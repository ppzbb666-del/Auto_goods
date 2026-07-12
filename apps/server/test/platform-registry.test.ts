import assert from "node:assert/strict"
import {
  PlatformWriteDisabledError,
  assertPlatformWriteEnabled,
  canWritePlatform,
  getPlatformCapability,
  listPlatformCapabilities
} from "../src/platform-registry"

const profiles = listPlatformCapabilities()
assert.equal(profiles.length, 4)
assert.equal(canWritePlatform("temu"), true)
assert.equal(canWritePlatform("tiktok-shop"), false)
assert.equal(getPlatformCapability("tiktok-shop")?.stage, "research")
assert.ok((getPlatformCapability("tiktok-shop")?.blockers.length ?? 0) > 0)

const first = profiles[0]!
first.blockers.push("mutation-test")
assert.equal(getPlatformCapability(first.platform)?.blockers.includes("mutation-test"), false)

assert.equal(assertPlatformWriteEnabled("temu").platform, "temu")
for (const platform of ["tiktok-shop", "shopee", "amazon"] as const) {
  assert.throws(
    () => assertPlatformWriteEnabled(platform),
    (error: unknown) => error instanceof PlatformWriteDisabledError
      && error.code === "PLATFORM_WRITE_DISABLED"
      && error.platform === platform
      && error.blockers.length > 0
  )
}

console.log("ALL PLATFORM REGISTRY TESTS PASSED")
