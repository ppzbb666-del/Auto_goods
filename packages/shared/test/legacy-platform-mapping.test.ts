import assert from "node:assert/strict"
import { createMockTask, mockProducts } from "../src/mock"
import { standardProductFromPublishTask } from "../src/legacy-platform-mapping"

const task = createMockTask(mockProducts[0]!)
const product = standardProductFromPublishTask(task)

assert.equal(product.id, task.product.id)
assert.equal(product.title, task.product.title)
assert.equal(product.sourceReference, task.product.sourceUrl)
assert.deepEqual(product.media.imageUrls, task.product.images)
assert.equal(product.skus.length, task.product.skus.length)
assert.equal(product.skus[0]?.purchasePrice, task.product.skus[0]?.costCny)
assert.equal(product.skus[0]?.currency, "CNY")

product.attributes.mutated = "yes"
assert.equal(task.product.attributes.mutated, undefined)

console.log("ALL LEGACY PLATFORM MAPPING TESTS PASSED")
