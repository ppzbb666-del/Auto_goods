import type {
  DianxiaomiCollectedProduct,
  DianxiaomiPageContext,
  DianxiaomiListingRequirementRules,
  DianxiaomiProductWorkItem,
  PricingRules,
  ProductCandidate,
  PublishTask
} from "@temu-ai-ops/shared"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export type PersistedPlannerState = {
  products: ProductCandidate[]
  tasks: PublishTask[]
  dianxiaomiCollectedProducts?: DianxiaomiCollectedProduct[]
  dianxiaomiProductWorkItems?: DianxiaomiProductWorkItem[]
  dianxiaomiPageContext?: DianxiaomiPageContext | null
  dianxiaomiRequirementRules?: DianxiaomiListingRequirementRules
  activeTaskId: string | null
  pricingRules?: PricingRules
  savedAt: string
}

const getRepoRoot = () => {
  const currentFile = fileURLToPath(import.meta.url)
  return path.resolve(path.dirname(currentFile), "../../..")
}

const getDataPath = () => process.env.PLANNER_STATE_PATH ?? path.join(getRepoRoot(), ".runtime/data/planner-state.json")

export const loadPlannerState = (): PersistedPlannerState | null => {
  const dataPath = getDataPath()
  if (!existsSync(dataPath)) {
    return null
  }

  // P2-3: tolerate a corrupt/partial state file rather than crashing the
  // server on startup. A truncated write (e.g. process killed mid-save)
  // would otherwise make the whole server fail to boot.
  try {
    return JSON.parse(readFileSync(dataPath, "utf8")) as PersistedPlannerState
  } catch (error) {
    console.warn(`planner state file is unreadable, starting from empty state: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

export const savePlannerState = (state: Omit<PersistedPlannerState, "savedAt">) => {
  const dataPath = getDataPath()
  mkdirSync(path.dirname(dataPath), {
    recursive: true
  })

  // P2-3: atomic write — serialize to a temp file then rename. rename is
  // atomic on the same filesystem, so a crash mid-write leaves the previous
  // good state intact instead of a half-written / corrupt JSON file. This is
  // the durability win that motivated the "upgrade to a DB" item, achieved
  // without a schema migration.
  const tempPath = `${dataPath}.tmp`
  writeFileSync(
    tempPath,
    JSON.stringify(
      {
        ...state,
        savedAt: new Date().toISOString()
      },
      null,
      2
    ),
    "utf8"
  )
  renameSync(tempPath, dataPath)
}
