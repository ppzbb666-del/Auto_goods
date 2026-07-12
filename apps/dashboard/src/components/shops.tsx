import { useQuery } from "@tanstack/react-query"
import { fetchDianxiaomiStoreMetrics } from "../api"

export function ShopCenter() {
  const storesQuery = useQuery({
    queryKey: ["shop-center", "temu"],
    queryFn: fetchDianxiaomiStoreMetrics,
    staleTime: 15_000
  })
  const stores = storesQuery.data ?? []
  const totalTasks = stores.reduce((sum, store) => sum + store.workItemCount, 0)
  const attentionStores = stores.filter((store) => store.blockedCount + store.needsRevisionCount > 0).length

  return (
    <main className="shop-workspace">
      <section className="catalog-heading">
        <div><p className="eyebrow">Shop Accounts</p><h1>店铺管理</h1><p>统一查看各平台店铺、发布渠道和任务健康状态。</p></div>
        <span className="catalog-readonly">只读兼容模式</span>
      </section>
      <section className="shop-summary">
        <div><span>已识别店铺</span><strong>{stores.length}</strong><small>来自店小秘扫描与任务</small></div>
        <div><span>商品任务</span><strong>{totalTasks}</strong><small>Temu 当前工作队列</small></div>
        <div><span>需要关注</span><strong>{attentionStores}</strong><small>存在阻塞或待修订</small></div>
        <div><span>待接入平台</span><strong>1</strong><small>TikTok Shop</small></div>
      </section>
      <section className="catalog-panel">
        <div className="shop-section-head"><div><strong>Temu 店铺</strong><span>发布渠道：店小秘浏览器自动化</span></div><span>{stores.length} 个账号</span></div>
        {storesQuery.isLoading ? <div className="catalog-empty">正在加载店铺...</div> : storesQuery.isError ? <div className="catalog-empty error">店铺信息加载失败，请确认服务端已启动。</div> : stores.length ? <div className="shop-grid">{stores.map((store, index) => {
          const attention = store.blockedCount + store.needsRevisionCount
          const name = store.storeName || `Temu 店铺 ${index + 1}`
          return <article key={store.storeId || store.storeName || String(index)} className="shop-card">
            <div className="shop-card-head"><span className="shop-platform-mark temu">T</span><div><strong>{name}</strong><small>{store.storeId || "未识别店铺 ID"}</small></div><span className={`shop-health ${attention ? "attention" : "healthy"}`}>{attention ? "需要关注" : "运行正常"}</span></div>
            <dl><div><dt>销售平台</dt><dd>Temu</dd></div><div><dt>发布渠道</dt><dd>店小秘浏览器</dd></div><div><dt>站点</dt><dd>随当前店铺页面</dd></div><div><dt>账号能力</dt><dd>创建草稿 / 提交核价 / 状态回查</dd></div></dl>
            <div className="shop-metrics"><div><strong>{store.workItemCount}</strong><span>任务</span></div><div><strong>{store.readyCount}</strong><span>已就绪</span></div><div><strong>{store.editedCount}</strong><span>已编辑</span></div><div><strong>{attention}</strong><span>待处理</span></div></div>
          </article>
        })}</div> : <div className="catalog-empty">尚未从店小秘识别到店铺。</div>}
      </section>
      <section className="shop-coming-soon"><span className="shop-platform-mark tiktok">♪</span><div><strong>TikTok Shop</strong><p>账号接入将在官方规则矩阵和开放接口权限确认后启用。</p></div><span>计划接入</span></section>
    </main>
  )
}

