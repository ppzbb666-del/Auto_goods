import type { PublishTask, PublishingTaskStatus, PublishingTaskSummary } from "@temu-ai-ops/shared"
import { canWritePlatform } from "./platform-registry"

const mapLegacyStatus = (status: PublishTask["status"]): PublishingTaskStatus => {
  switch (status) {
    case "queued": return "queued"
    case "planned": return "preparing"
    case "approved": return "ready"
    case "executing": return "running"
    case "reviewing": return "reviewing"
    case "completed": return "completed"
    case "rejected":
    case "failed": return "failed"
  }
}

export const publishingTaskSummaryFromLegacy = (task: PublishTask): PublishingTaskSummary => {
  const completedSteps = task.steps.filter((step) => step.status === "done").length
  const totalSteps = task.steps.length
  const risks = task.risks.reduce((counts, risk) => {
    counts[risk.level] += 1
    return counts
  }, { low: 0, medium: 0, high: 0 })

  return {
    id: `temu:${task.id}`,
    legacyTaskId: task.id,
    productId: task.product.id,
    productTitle: task.product.title,
    platform: "temu",
    channel: "dianxiaomi-browser",
    shopAccountId: task.product.attributes.storeId
      ? `dianxiaomi:${task.product.attributes.storeId}`
      : undefined,
    status: mapLegacyStatus(task.status),
    progress: {
      completedSteps,
      totalSteps,
      percent: totalSteps ? Math.round(completedSteps / totalSteps * 100) : 0
    },
    risks,
    writeEnabled: canWritePlatform("temu"),
    updatedAt: task.updatedAt,
    source: "legacy-publish-task",
    readOnly: true
  }
}

export const listPublishingTaskSummaries = (tasks: PublishTask[]) =>
  tasks.map(publishingTaskSummaryFromLegacy).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

export const getPublishingTaskSummary = (tasks: PublishTask[], id: string) => {
  const legacyId = id.startsWith("temu:") ? id.slice("temu:".length) : id
  const task = tasks.find((candidate) => candidate.id === legacyId)
  return task ? publishingTaskSummaryFromLegacy(task) : null
}

