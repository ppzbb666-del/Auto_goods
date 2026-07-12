import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { StandardProduct } from "@temu-ai-ops/shared"
import { fetchCatalogProduct, fetchCatalogProducts } from "../api"

const sourceLabels: Record<StandardProduct["source"], string> = {
  "1688": "1688",
  manual: "手工录入",
  csv: "CSV 导入",
  erp: "ERP",
  platform: "平台采集"
}

export function CatalogProductCenter() {
  const [search, setSearch] = useState("")
  const [source, setSource] = useState<StandardProduct["source"] | "">("")
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const catalogQuery = useQuery({
    queryKey: ["catalog-products", search, source],
    queryFn: () => fetchCatalogProducts({ search, source: source || undefined }),
    staleTime: 15_000
  })
  const catalog = catalogQuery.data
  const detailQuery = useQuery({
    queryKey: ["catalog-product", selectedProductId],
    queryFn: () => fetchCatalogProduct(selectedProductId!),
    enabled: Boolean(selectedProductId)
  })
  const selectedProduct = detailQuery.data

  return (
    <main className="catalog-workspace">
      <section className="catalog-heading">
        <div><p className="eyebrow">Product Catalog</p><h1>商品中心</h1><p>统一查看标准商品资料。当前数据由现有 Temu 任务只读转换，不会修改原任务。</p></div>
        <span className="catalog-readonly">只读兼容模式</span>
      </section>
      <section className="catalog-panel">
        <div className="catalog-toolbar">
          <label className="catalog-search"><span>搜索</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="商品名称、ID 或来源链接" /></label>
          <label><span>来源</span><select value={source} onChange={(event) => setSource(event.target.value as StandardProduct["source"] | "")}><option value="">全部来源</option>{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <div className="catalog-count"><strong>{catalog?.total ?? 0}</strong><span>件标准商品</span></div>
        </div>
        {catalogQuery.isLoading ? <div className="catalog-empty">正在加载商品...</div> : catalogQuery.isError ? <div className="catalog-empty error">商品目录加载失败，请确认服务端已启动。</div> : catalog?.items.length ? (
          <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>商品</th><th>来源</th><th>类目</th><th>SKU</th><th>库存</th><th>采购价</th><th>更新时间</th></tr></thead><tbody>{catalog.items.map((product) => {
            const stock = product.skus.reduce((sum, sku) => sum + sku.stock, 0)
            const prices = product.skus.map((sku) => sku.purchasePrice)
            const minPrice = prices.length ? Math.min(...prices) : 0
            const maxPrice = prices.length ? Math.max(...prices) : 0
            return <tr key={product.id} className="catalog-clickable-row" onClick={() => setSelectedProductId(product.id)}><td><div className="catalog-product-cell">{product.media.mainImageUrl ? <img src={product.media.mainImageUrl} alt="" /> : <span className="catalog-image-placeholder">无图</span>}<div><strong>{product.title}</strong><small>{product.id}</small></div></div></td><td><span className="catalog-source">{sourceLabels[product.source]}</span></td><td>{product.categoryHint || "未归类"}</td><td>{product.skus.length}</td><td>{stock}</td><td>{minPrice === maxPrice ? `${minPrice.toFixed(2)} CNY` : `${minPrice.toFixed(2)}-${maxPrice.toFixed(2)} CNY`}</td><td>{new Date(product.updatedAt).toLocaleString()}</td></tr>
          })}</tbody></table></div>
        ) : <div className="catalog-empty">没有符合条件的商品。</div>}
      </section>
      {selectedProductId ? <div className="catalog-detail-backdrop" onMouseDown={() => setSelectedProductId(null)}>
        <aside className="catalog-detail" onMouseDown={(event) => event.stopPropagation()} aria-label="商品详情">
          <div className="catalog-detail-head"><div><span>标准商品</span><strong>{selectedProduct?.title ?? "正在加载..."}</strong></div><button onClick={() => setSelectedProductId(null)} aria-label="关闭">×</button></div>
          {detailQuery.isError ? <div className="catalog-empty error">商品详情加载失败。</div> : selectedProduct ? <>
            <div className="catalog-detail-summary">{selectedProduct.media.mainImageUrl ? <img src={selectedProduct.media.mainImageUrl} alt="" /> : <span className="catalog-detail-placeholder">无图</span>}<dl><div><dt>商品 ID</dt><dd>{selectedProduct.id}</dd></div><div><dt>来源</dt><dd>{sourceLabels[selectedProduct.source]}</dd></div><div><dt>类目</dt><dd>{selectedProduct.categoryHint || "未归类"}</dd></div></dl></div>
            <section className="catalog-detail-section"><h3>平台刊登</h3><div className="catalog-platform-list"><div><span className="platform-logo temu">T</span><div><strong>Temu</strong><small>当前任务来源，可继续使用原有自动化流程</small></div><span className="platform-state active">已接入</span></div><div><span className="platform-logo tiktok">♪</span><div><strong>TikTok Shop</strong><small>等待规则映射与草稿适配器</small></div><span className="platform-state">待创建</span></div></div></section>
            <section className="catalog-detail-section"><h3>SKU 与库存</h3><div className="catalog-sku-list">{selectedProduct.skus.map((sku) => <div key={sku.id}><div><strong>{sku.sellerSku}</strong><small>{Object.values(sku.optionValues).join(" / ") || "默认规格"}</small></div><span>{sku.stock} 件</span><span>{sku.purchasePrice.toFixed(2)} {sku.currency}</span></div>)}</div></section>
            <section className="catalog-detail-section"><h3>商品图片</h3><div className="catalog-media-grid">{selectedProduct.media.imageUrls.map((url) => <img key={url} src={url} alt="" />)}{selectedProduct.media.imageUrls.length === 0 ? <span>暂无图片</span> : null}</div></section>
          </> : <div className="catalog-empty">正在加载商品详情...</div>}
        </aside>
      </div> : null}
    </main>
  )
}
