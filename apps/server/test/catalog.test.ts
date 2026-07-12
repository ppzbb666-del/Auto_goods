import assert from "node:assert/strict"
import { createMockTask, mockProducts } from "@temu-ai-ops/shared"
import { getCatalogProductFromTasks, listCatalogProductsFromTasks } from "../src/catalog"

const tasks = mockProducts.map(createMockTask)
const all = listCatalogProductsFromTasks(tasks)

assert.equal(all.readOnly, true)
assert.equal(all.source, "legacy-publish-tasks")
assert.equal(all.total, tasks.length)
assert.equal(all.items.length, tasks.length)

const searched = listCatalogProductsFromTasks(tasks, { search: tasks[0]!.product.id })
assert.equal(searched.total, 1)
assert.equal(searched.items[0]?.id, tasks[0]!.product.id)

const detail = getCatalogProductFromTasks(tasks, tasks[0]!.product.id)
assert.equal(detail?.id, tasks[0]!.product.id)
assert.equal(getCatalogProductFromTasks(tasks, "missing"), null)

console.log("ALL CATALOG TESTS PASSED")

