import assert from "node:assert/strict"
import { createMockTask, mockProducts } from "@temu-ai-ops/shared"
import { getPublishingTaskSummary, listPublishingTaskSummaries, publishingTaskSummaryFromLegacy } from "../src/publishing-task-catalog"

const task = createMockTask(mockProducts[0]!)
task.status = "executing"
task.steps[0]!.status = "done"
task.risks.push({ id: "high-risk", level: "high", message: "test" })

const summary = publishingTaskSummaryFromLegacy(task)
assert.equal(summary.id, `temu:${task.id}`)
assert.equal(summary.platform, "temu")
assert.equal(summary.channel, "dianxiaomi-browser")
assert.equal(summary.status, "running")
assert.equal(summary.progress.completedSteps, 1)
assert.equal(summary.progress.totalSteps, task.steps.length)
assert.equal(summary.risks.high, 1)
assert.equal(summary.writeEnabled, true)
assert.equal(summary.readOnly, true)

assert.equal(listPublishingTaskSummaries([task]).length, 1)
assert.equal(getPublishingTaskSummary([task], summary.id)?.legacyTaskId, task.id)
assert.equal(getPublishingTaskSummary([task], task.id)?.legacyTaskId, task.id)
assert.equal(getPublishingTaskSummary([task], "missing"), null)

console.log("ALL PUBLISHING TASK CATALOG TESTS PASSED")

