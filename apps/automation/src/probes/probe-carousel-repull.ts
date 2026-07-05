// Real-machine verification for carousel re-pull: navigates to a product whose
// carousel images are broken 0×0 (deleted wxalbum copies), calls the PRODUCTION
// repullBrokenCarouselImages(), and reports whether the carousel became healthy.
// This mutates the draft (re-adds carousel images) but does NOT save/submit — it
// isolates the re-pull mechanism. Full save+submit proof is a separate full-flow run.
// Usage: tsx src/probes/probe-carousel-repull.ts [--url=...] [--profile=...]
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium, type Page } from "playwright"
import { getArgValue, waitForManualLoginIfNeeded } from "../common"
import { inspectDianxiaomiTargetSurface, repullBrokenCarouselImages, waitForPublishPage } from "../adapters/dianxiaomi-adapter"
import { loadSelectorConfig } from "../selector-config"

const DEFAULT_URL = "https://www.dianxiaomi.com/web/popTemu/edit?id=161406453047896984"

const readCarouselHealth = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector(".img-module") ?? document.body
    const imgs = Array.from(root.querySelectorAll("img")).slice(0, 30) as HTMLImageElement[]
    const carousel = imgs.filter((im) => !/material-img/i.test((im.closest("[class*='module' i]") as HTMLElement | null)?.className ?? ""))
    const considered = carousel.length > 0 ? carousel : imgs
    const broken = considered.filter((im) => im.complete && im.naturalWidth === 0 && im.naturalHeight === 0)
    return { total: considered.length, broken: broken.length, allBroken: considered.length > 0 && broken.length === considered.length }
  }).catch(() => ({ total: 0, broken: 0, allBroken: false }))

const main = async () => {
  const targetUrl = getArgValue("url") ?? DEFAULT_URL
  const profileDir = path.resolve(getArgValue("profile") ?? ".runtime/playwright/dianxiaomi-profile")
  const cfg = loadSelectorConfig(".runtime/dianxiaomi-selector-config.json")
  const artifactDir = path.resolve(`.runtime/probe-carousel-repull-${new Date().toISOString().replace(/[:.]/g, "-")}`)
  await mkdir(artifactDir, { recursive: true })
  const context = await chromium.launchPersistentContext(profileDir, { channel: "chromium", headless: true, viewport: { width: 1440, height: 960 } })
  try {
    const page = context.pages().find((p) => !p.isClosed()) ?? await context.newPage()
    page.setDefaultTimeout(20000)
    if (page.url() !== targetUrl) await page.goto(targetUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined)
    await waitForManualLoginIfNeeded(page)
    await waitForPublishPage(page, cfg, { targetUrl })
    await inspectDianxiaomiTargetSurface(page, cfg)
    await page.waitForTimeout(2500)

    const before = await readCarouselHealth(page)
    await page.screenshot({ path: path.join(artifactDir, "carousel-before.png") }).catch(() => undefined)
    const repull = await repullBrokenCarouselImages(page)
    await page.waitForTimeout(1500)
    const after = await readCarouselHealth(page)
    await page.screenshot({ path: path.join(artifactDir, "carousel-after.png") }).catch(() => undefined)

    const payload = { targetUrl, before, repull, after, verdict: repull.repulled && after.broken === 0 && after.total >= 3 ? "REPULLED-HEALTHY" : repull.attempted ? "ATTEMPTED-BUT-STILL-BROKEN" : "SKIPPED-NOT-BROKEN" }
    await writeFile(path.join(artifactDir, "probe-carousel-repull.json"), JSON.stringify(payload, null, 2), "utf8")
    console.log(JSON.stringify(payload, null, 2))
    console.log(path.join(artifactDir, "probe-carousel-repull.json"))
  } finally { await context.close().catch(() => undefined) }
}
main().catch((e) => { console.error(e instanceof Error ? e.stack ?? e.message : String(e)); process.exitCode = 1 })
