import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchCatalogProducts } from "../api"

export function MediaCenter({ onOpenPodStudio }: { onOpenPodStudio: () => void }) {
  const [filter, setFilter] = useState<"all" | "missing" | "with-images">("all")
  const catalogQuery = useQuery({ queryKey: ["media-center", "catalog"], queryFn: () => fetchCatalogProducts() })
  const products = catalogQuery.data?.items ?? []
  const imageCount = products.reduce((sum, product) => sum + product.media.imageUrls.length, 0)
  const missingCount = products.filter((product) => product.media.imageUrls.length === 0).length
  const skuImageCount = products.reduce((sum, product) => sum + product.skus.filter((sku) => Boolean(sku.imageUrl)).length, 0)
  const visibleProducts = useMemo(() => products.filter((product) => filter === "all" || (filter === "missing" ? product.media.imageUrls.length === 0 : product.media.imageUrls.length > 0)), [products, filter])
  const mediaItems = visibleProducts.flatMap((product) => product.media.imageUrls.map((url, index) => ({ url, productId: product.id, title: product.title, primary: index === 0 })))

  return <main className="media-workspace">
    <section className="catalog-heading"><div><p className="eyebrow">Media Library</p><h1>素材中心</h1><p>统一盘点商品图片和素材完整度。实际图片处理继续使用现有工具链。</p></div><button className="media-primary-action" onClick={onOpenPodStudio}>打开 POD 素材工具</button></section>
    <section className="media-kpis"><div><span>商品图片</span><strong>{imageCount}</strong><small>{products.length} 件标准商品</small></div><div><span>缺图商品</span><strong>{missingCount}</strong><small>需要补充基础图片</small></div><div><span>SKU 图片</span><strong>{skuImageCount}</strong><small>已关联规格图片</small></div><div><span>处理工具</span><strong>4</strong><small>翻译 / 改尺寸 / 白底 / 编辑</small></div></section>
    <section className="media-tools"><div><span>译</span><div><strong>图片翻译</strong><small>由原店小秘媒体流程执行</small></div></div><div><span>尺</span><div><strong>批量改尺寸</strong><small>沿用现有自动化反馈验证</small></div></div><div><span>白</span><div><strong>白底处理</strong><small>按平台规则选择性启用</small></div></div><div><span>POD</span><div><strong>素材裂变</strong><small>可进入现有 POD 工具</small></div></div></section>
    <section className="catalog-panel"><div className="media-toolbar"><div><strong>商品图片库</strong><span>{mediaItems.length} 张图片</span></div><div className="media-segments"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部</button><button className={filter === "with-images" ? "active" : ""} onClick={() => setFilter("with-images")}>有图片</button><button className={filter === "missing" ? "active" : ""} onClick={() => setFilter("missing")}>缺图商品</button></div></div>
      {catalogQuery.isLoading ? <div className="catalog-empty">正在加载素材...</div> : filter === "missing" ? <div className="media-missing-list">{visibleProducts.map((product) => <div key={product.id}><span className="publish-image-placeholder">无图</span><div><strong>{product.title}</strong><small>{product.id}</small></div><span>{product.skus.length} SKU</span></div>)}{visibleProducts.length === 0 ? <div className="catalog-empty">没有缺图商品。</div> : null}</div> : mediaItems.length ? <div className="media-gallery">{mediaItems.map((item, index) => <figure key={`${item.productId}-${index}-${item.url}`}><img src={item.url} alt="" /><figcaption><strong>{item.title}</strong><span>{item.primary ? "主图" : `图片 ${index + 1}`}</span></figcaption></figure>)}</div> : <div className="catalog-empty">暂无商品图片。</div>}
    </section>
    <p className="media-safety">图片翻译、尺寸处理、白底和编辑仍由原发布流程的媒体反馈门禁控制，本页面不直接修改素材。</p>
  </main>
}

