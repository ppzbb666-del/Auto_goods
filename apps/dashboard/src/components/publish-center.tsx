import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchCatalogProducts, fetchDianxiaomiStoreMetrics } from "../api"

export function PublishCenter({ onOpenLegacyFlow }: { onOpenLegacyFlow: () => void }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [storeKey, setStoreKey] = useState("")
  const productsQuery = useQuery({ queryKey: ["publish-center", "products"], queryFn: () => fetchCatalogProducts() })
  const storesQuery = useQuery({ queryKey: ["publish-center", "stores"], queryFn: fetchDianxiaomiStoreMetrics })
  const products = productsQuery.data?.items ?? []
  const stores = storesQuery.data ?? []
  const selectedProducts = useMemo(() => products.filter((product) => selectedIds.includes(product.id)), [products, selectedIds])
  const missingImages = selectedProducts.filter((product) => product.media.imageUrls.length === 0).length
  const missingSkus = selectedProducts.filter((product) => product.skus.length === 0).length
  const ready = selectedProducts.length > 0 && Boolean(storeKey) && missingImages === 0 && missingSkus === 0
  const toggleProduct = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])

  return <main className="publish-workspace">
    <section className="catalog-heading"><div><p className="eyebrow">Publishing Workspace</p><h1>发布中心</h1><p>配置跨平台发布目标并预览校验结果。当前不会创建或执行新任务。</p></div><span className="catalog-readonly">安全预览</span></section>
    <section className="publish-steps"><div className={selectedIds.length ? "done" : "active"}><span>1</span><div><strong>选择商品</strong><small>{selectedIds.length} 件已选</small></div></div><i /><div className={storeKey ? "done" : selectedIds.length ? "active" : ""}><span>2</span><div><strong>选择目标</strong><small>平台与店铺</small></div></div><i /><div className={ready ? "active" : ""}><span>3</span><div><strong>检查与发布</strong><small>沿用原 Temu 门禁</small></div></div></section>
    <section className="publish-layout">
      <article className="publish-panel"><div className="publish-panel-head"><div><strong>标准商品</strong><span>从商品中心选择</span></div><button onClick={() => setSelectedIds(selectedIds.length === products.length ? [] : products.map((product) => product.id))}>{selectedIds.length === products.length && products.length ? "取消全选" : "全选"}</button></div>{productsQuery.isLoading ? <div className="catalog-empty">正在加载商品...</div> : <div className="publish-product-list">{products.map((product) => <label key={product.id} className={selectedIds.includes(product.id) ? "selected" : ""}><input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleProduct(product.id)} />{product.media.mainImageUrl ? <img src={product.media.mainImageUrl} alt="" /> : <span className="publish-image-placeholder">无图</span>}<div><strong>{product.title}</strong><small>{product.skus.length} SKU / {product.categoryHint || "未归类"}</small></div></label>)}{products.length === 0 ? <div className="catalog-empty">暂无标准商品</div> : null}</div>}</article>
      <aside className="publish-side"><section className="publish-panel"><div className="publish-panel-head"><div><strong>发布目标</strong><span>销售平台与账号</span></div></div><div className="publish-targets"><label className="selected"><input type="radio" checked readOnly /><span className="shop-platform-mark temu">T</span><div><strong>Temu</strong><small>店小秘浏览器自动化</small></div></label><label className="disabled"><input type="radio" disabled /><span className="shop-platform-mark tiktok">♪</span><div><strong>TikTok Shop</strong><small>适配器与规则尚未完成</small></div></label></div><label className="publish-store-select"><span>目标店铺</span><select value={storeKey} onChange={(event) => setStoreKey(event.target.value)}><option value="">请选择 Temu 店铺</option>{stores.map((store, index) => { const key = store.storeId || store.storeName || String(index); return <option key={key} value={key}>{store.storeName || `Temu 店铺 ${index + 1}`}</option> })}</select></label></section>
        <section className="publish-panel"><div className="publish-panel-head"><div><strong>发布前检查</strong><span>基础资料预检</span></div></div><div className="publish-checks"><div className={selectedProducts.length ? "pass" : "wait"}><span>{selectedProducts.length ? "✓" : "·"}</span><div><strong>已选择商品</strong><small>{selectedProducts.length} 件</small></div></div><div className={storeKey ? "pass" : "wait"}><span>{storeKey ? "✓" : "·"}</span><div><strong>已选择店铺</strong><small>{storeKey ? "Temu 目标已确定" : "等待选择"}</small></div></div><div className={missingImages ? "fail" : selectedProducts.length ? "pass" : "wait"}><span>{missingImages ? "!" : selectedProducts.length ? "✓" : "·"}</span><div><strong>商品图片</strong><small>{missingImages ? `${missingImages} 件缺少图片` : "基础图片检查通过"}</small></div></div><div className={missingSkus ? "fail" : selectedProducts.length ? "pass" : "wait"}><span>{missingSkus ? "!" : selectedProducts.length ? "✓" : "·"}</span><div><strong>SKU 数据</strong><small>{missingSkus ? `${missingSkus} 件缺少 SKU` : "基础 SKU 检查通过"}</small></div></div></div><button className="publish-legacy-button" disabled={!ready} onClick={onOpenLegacyFlow}>返回现有 Temu 流程继续</button><p className="publish-safety-note">实际发布继续使用原首页的试跑、会话、页面和提交门禁。</p></section>
      </aside>
    </section>
  </main>
}

