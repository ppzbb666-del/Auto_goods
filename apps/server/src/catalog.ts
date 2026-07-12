import { standardProductFromPublishTask, type PublishTask, type StandardProduct } from "@temu-ai-ops/shared"

export type CatalogProductQuery = {
  search?: string
  source?: StandardProduct["source"]
  limit?: number
}

export type CatalogProductList = {
  items: StandardProduct[]
  total: number
  source: "legacy-publish-tasks"
  readOnly: true
}

export const listCatalogProductsFromTasks = (
  tasks: PublishTask[],
  query: CatalogProductQuery = {}
): CatalogProductList => {
  const search = query.search?.trim().toLocaleLowerCase()
  const limit = Math.max(1, Math.min(query.limit ?? 100, 500))
  const products = tasks
    .map(standardProductFromPublishTask)
    .filter((product) => !query.source || product.source === query.source)
    .filter((product) => {
      if (!search) return true
      return [product.id, product.title, product.brand, product.categoryHint, product.sourceReference]
        .some((value) => value?.toLocaleLowerCase().includes(search))
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  return {
    items: products.slice(0, limit),
    total: products.length,
    source: "legacy-publish-tasks",
    readOnly: true
  }
}

export const getCatalogProductFromTasks = (tasks: PublishTask[], productId: string) => {
  const task = tasks.find((candidate) => candidate.product.id === productId)
  return task ? standardProductFromPublishTask(task) : null
}

