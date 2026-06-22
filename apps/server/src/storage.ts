import type {
  DianxiaomiCollectedProduct,
  DianxiaomiPageContext,
  DianxiaomiListingRequirementRules,
  DianxiaomiProductWorkItem,
  PricingRules,
  ProductCandidate,
  PublishTask
} from "@temu-ai-ops/shared"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
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

  return JSON.parse(readFileSync(dataPath, "utf8")) as PersistedPlannerState
}

export const savePlannerState = (state: Omit<PersistedPlannerState, "savedAt">) => {
  const dataPath = getDataPath()
  mkdirSync(path.dirname(dataPath), {
    recursive: true
  })

  writeFileSync(
    dataPath,
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
}
