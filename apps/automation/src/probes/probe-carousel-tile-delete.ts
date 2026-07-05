// Read-only probe: dump the carousel image-tile structure so re-pull can DELETE the
// broken 0×0 tiles (dead wxalbum copies) that would otherwise fail submit's 1:1 gate.
// For each carousel tile: its naturalWidth/Height, and the selectors/classes of any
// delete/trash affordance inside it. No writes (does not click delete).
// Usage: tsx src/probes/probe-carousel-tile-delete.ts [--url=...] [--profile=...]
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium } from "playwright"
import { getArgValue, waitForManualLoginIfNeeded } from "../common"
import { inspectDianxiaomiTargetSurface, waitForPublishPage } from "../adapters/dianxiaomi-adapter"
import { loadSelectorConfig } from "../selector-config"

const DEFAULT_URL = "https://www.dianxiaomi.com/web/popTemu/edit?id=161406453047896984"

const main = async () => {
  const targetUrl = getArgValue("url") ?? DEFAULT_URL
  const profileDir = path.resolve(getArgValue("profile") ?? ".runtime/playwright/dianxiaomi-profile")
  const cfg = loadSelectorConfig(".runtime/dianxiaomi-selector-config.json")
  const artifactDir = path.resolve(`.runtime/probe-carousel-tile-delete-${new Date().toISOString().replace(/[:.]/g, "-")}`)
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

    const dump = await page.evaluate(() => {
      // Find the carousel module: the .img-module whose header/label mentions 产品轮播图.
      const modules = Array.from(document.querySelectorAll(".img-module, [class*='module' i]")) as HTMLElement[]
      const carouselModule = modules.find((m) => /轮播图/.test(m.innerText?.slice(0, 60) ?? "")) ?? document.querySelector(".img-module") as HTMLElement | null
      if (!carouselModule) return { error: "no carousel module" }
      // Candidate tiles: elements containing exactly one img.
      const imgs = Array.from(carouselModule.querySelectorAll("img")) as HTMLImageElement[]
      const tiles = imgs.map((im, idx) => {
        // climb to a reasonable tile wrapper (has a delete affordance sibling)
        let el: HTMLElement | null = im
        let tile: HTMLElement | null = im.parentElement
        for (let up = 0; up < 4 && tile; up += 1) {
          const del = tile.querySelector("[class*='delete' i], [class*='remove' i], .anticon-delete, .icon_delete, i[class*='trash' i]")
          if (del) break
          tile = tile.parentElement
        }
        const delNode = tile?.querySelector("[class*='delete' i], [class*='remove' i], .anticon-delete, .icon_delete, i[class*='trash' i]") as HTMLElement | null
        return {
          idx,
          naturalWidth: im.naturalWidth,
          naturalHeight: im.naturalHeight,
          broken: im.complete && im.naturalWidth === 0 && im.naturalHeight === 0,
          imgSrc: (im.getAttribute("src") ?? "").slice(0, 70),
          tileClass: (tile?.className ?? "").slice(0, 90),
          deleteFound: Boolean(delNode),
          deleteTag: delNode?.tagName ?? "",
          deleteClass: (delNode?.className ?? "").slice(0, 90)
        }
      })
      return { moduleClass: carouselModule.className.slice(0, 80), tileCount: tiles.length, tiles }
    }).catch((e) => ({ error: String(e) }))

    await writeFile(path.join(artifactDir, "probe-carousel-tile-delete.json"), JSON.stringify(dump, null, 2), "utf8")
    console.log(JSON.stringify(dump, null, 2))
    console.log(path.join(artifactDir, "probe-carousel-tile-delete.json"))
  } finally { await context.close().catch(() => undefined) }
}
main().catch((e) => { console.error(e instanceof Error ? e.stack ?? e.message : String(e)); process.exitCode = 1 })
