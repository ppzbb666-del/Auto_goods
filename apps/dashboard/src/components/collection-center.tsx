import { useQuery } from "@tanstack/react-query"
import { fetchCatalogProducts, fetchDianxiaomiCollectedProducts } from "../api"

export function CollectionCenter({ onOpenLegacyTools }: { onOpenLegacyTools: () => void }) {
  const catalogQuery = useQuery({ queryKey: ["collection-center", "catalog"], queryFn: () => fetchCatalogProducts() })
  const collectedQuery = useQuery({ queryKey: ["collection-center", "dianxiaomi"], queryFn: fetchDianxiaomiCollectedProducts })
  const products = catalogQuery.data?.items ?? []
  const sourceCounts = products.reduce<Record<string, number>>((counts, product) => {
    counts[product.source] = (counts[product.source] ?? 0) + 1
    return counts
  }, {})
  const sources = [
    { id: "dianxiaomi", mark: "店", title: "店小秘采集", detail: "扫描采集箱和待发布商品，沿用现有页面识别与导入流程。", count: collectedQuery.data?.length ?? 0, tone: "blue", available: true },
    { id: "1688", mark: "16", title: "1688 商品", detail: "当前标准商品中由 1688 来源创建的商品。", count: sourceCounts["1688"] ?? 0, tone: "orange", available: true },
    { id: "csv", mark: "CSV", title: "CSV / Excel 导入", detail: "使用现有模板、字段校验、SKU 分组和错误提示。", count: sourceCounts.csv ?? 0, tone: "green", available: true },
    { id: "manual", mark: "+", title: "手工录入", detail: "适合单个商品补录，继续使用原商品任务创建逻辑。", count: sourceCounts.manual ?? 0, tone: "gray", available: true },
    { id: "tiktok", mark: "♪", title: "TikTok Shop 商品回采", detail: "需等待官方接口权限和账号授权方案确认。", count: 0, tone: "dark", available: false },
    { id: "erp", mark: "ERP", title: "其他 ERP", detail: "预留标准适配器，尚未绑定具体 ERP。", count: sourceCounts.erp ?? 0, tone: "purple", available: false }
  ]

  return <main className="collection-workspace">
    <section className="catalog-heading"><div><p className="eyebrow">Product Sources</p><h1>采集中心</h1><p>统一管理商品来源。实际导入继续使用现有成熟工具，避免出现两套数据入口。</p></div><span className="catalog-readonly">兼容入口</span></section>
    <section className="collection-summary"><div><span>标准商品</span><strong>{products.length}</strong><small>已进入统一商品视图</small></div><div><span>已采集待处理</span><strong>{collectedQuery.data?.length ?? 0}</strong><small>店小秘采集记录</small></div><div><span>可用来源</span><strong>{sources.filter((source) => source.available).length}</strong><small>沿用原有导入能力</small></div><div><span>计划来源</span><strong>{sources.filter((source) => !source.available).length}</strong><small>等待适配器接入</small></div></section>
    <section className="collection-grid">{sources.map((source) => <article key={source.id} className={`collection-card ${source.available ? "" : "disabled"}`}><div className="collection-card-head"><span className={`collection-mark ${source.tone}`}>{source.mark}</span><span className={source.available ? "collection-state active" : "collection-state"}>{source.available ? "已可用" : "计划中"}</span></div><h2>{source.title}</h2><p>{source.detail}</p><div className="collection-card-foot"><div><strong>{source.count}</strong><span>当前记录</span></div>{source.available ? <button onClick={onOpenLegacyTools}>进入原导入工具</button> : <button disabled>尚未开放</button>}</div></article>)}</section>
    <section className="collection-flow"><strong>统一采集流程</strong><div><span>外部商品来源</span><i>→</i><span>原有导入与校验</span><i>→</i><span>标准商品视图</span><i>→</i><span>平台发布中心</span></div><p>当前只在读取侧建立统一视图，原有任务仍是事实来源。</p></section>
  </main>
}

