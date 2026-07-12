import { strict as assert } from "node:assert"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import type { DianxiaomiSelectorConfig, SelectorDiagnosisReport } from "@temu-ai-ops/shared"

const currentFile = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(currentFile), "../../..")
const testDir = mkdtempSync(path.join(tmpdir(), "selector-config-generate-"))
const diagnosisPath = path.join(testDir, "dianxiaomi-diagnosis-test.json")
const outputPath = path.join(testDir, "dianxiaomi-selector-config.json")

const diagnosis = {
  pageUrl: "https://www.dianxiaomi.com/web/popTemu/edit?id=unit-shipping-warehouse",
  pageTitle: "Real Dianxiaomi selector config test",
  createdAt: new Date().toISOString(),
  requiredOk: true,
  targetSurface: {
    id: "target-surface",
    label: "Target surface",
    status: "done",
    detail: "real Dianxiaomi listing edit page",
    data: {
      surfaceStatus: "real-dianxiaomi",
      isDianxiaomiHost: true,
      isDataFixture: false,
      canInspect: true
    }
  },
  summary: {
    fieldCount: 5,
    buttonCount: 2,
    mediaToolCount: 0,
    skuRowCount: 1
  },
  fields: {
    title: { ok: true, candidates: [{ selectorHint: "input[name='title']" }] },
    description: { ok: true, candidates: [{ selectorHint: "textarea[name='description']" }] },
    price: { ok: true, candidates: [{ selectorHint: "input[name='price']" }] },
    stock: { ok: true, candidates: [{ selectorHint: "input[name='stock']" }] },
    attribute: { ok: true, candidates: [{ selectorHint: "input[name='variationSku']" }] }
  },
  buttons: {
    save: { ok: true, candidates: [{ selectorHint: "button.save" }] },
    submit: { ok: true, candidates: [{ selectorHint: "button.submit" }] }
  },
  mediaTools: {},
  mediaToolActions: {
    apply: {},
    close: {}
  },
  skuRows: {
    ok: true,
    count: 1,
    samples: []
  }
} as unknown as SelectorDiagnosisReport

const existingConfig: DianxiaomiSelectorConfig = {
  fields: { title: ["input.old-title"] },
  buttons: { save: ["button.old-save"] },
  skuRows: ["tr.old-row"],
  shippingWarehouse: " LIVELY "
}

try {
  writeFileSync(diagnosisPath, JSON.stringify(diagnosis, null, 2), "utf8")
  writeFileSync(outputPath, JSON.stringify(existingConfig, null, 2), "utf8")

  const result = spawnSync(process.execPath, [
    path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"),
    path.join(repoRoot, "apps/automation/src/selector-config-generate.ts"),
    `--diagnosis=${diagnosisPath}`,
    `--output=${outputPath}`,
    "--require-real-dianxiaomi=true"
  ], {
    cwd: repoRoot,
    encoding: "utf8"
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)

  const generated = JSON.parse(readFileSync(outputPath, "utf8")) as DianxiaomiSelectorConfig
  assert.equal(generated.shippingWarehouse, "LIVELY", "generation must preserve the account shipping warehouse")
  assert.deepEqual(generated.fields.title, ["input[name='title']"], "diagnosed selectors should still be regenerated")
  assert.deepEqual(generated.buttons.save, ["button.save"], "diagnosed buttons should still be regenerated")

  console.log("PASS selector config generation preserves shippingWarehouse")
} finally {
  rmSync(testDir, { recursive: true, force: true })
}
