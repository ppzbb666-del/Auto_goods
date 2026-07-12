import { useQuery } from "@tanstack/react-query"
import type { ShopAccount } from "@temu-ai-ops/shared"
import { fetchShopAccounts } from "../api"

const channelLabels: Record<ShopAccount["channel"], string> = {
  "official-api": "官方 API",
  "dianxiaomi-browser": "店小秘浏览器",
  "seller-center-browser": "卖家中心浏览器",
  "browser-extension": "浏览器插件"
}

export function ShopCenter() {
  const shopsQuery = useQuery({ queryKey: ["shop-accounts"], queryFn: fetchShopAccounts, staleTime: 15_000 })
  const shops = shopsQuery.data ?? []
  const totalTasks = shops.reduce((sum, shop) => sum + shop.metrics.workItemCount, 0)
  const attentionCount = shops.filter((shop) => shop.account.status === "attention").length

  return <main className="shop-workspace">
    <section className="catalog-heading"><div><p className="eyebrow">Shop Accounts</p><h1>店铺管理</h1><p>使用统一店铺账号模型查看平台、渠道、能力和任务健康状态。</p></div><span className="catalog-readonly">只读兼容模式</span></section>
    <section className="shop-summary"><div><span>统一店铺账号</span><strong>{shops.length}</strong><small>当前来自 Temu 兼容映射</small></div><div><span>商品任务</span><strong>{totalTasks}</strong><small>现有店小秘工作队列</small></div><div><span>需要关注</span><strong>{attentionCount}</strong><small>存在阻塞或待修订</small></div><div><span>待接入平台</span><strong>3</strong><small>TikTok / Shopee / Amazon</small></div></section>
    <section className="catalog-panel"><div className="shop-section-head"><div><strong>店铺账号</strong><span>平台、发布渠道和能力统一展示</span></div><span>{shops.length} 个账号</span></div>
      {shopsQuery.isLoading ? <div className="catalog-empty">正在加载店铺...</div> : shopsQuery.isError ? <div className="catalog-empty error">统一店铺接口加载失败，请确认服务端已启动。</div> : shops.length ? <div className="shop-grid">{shops.map(({ account, metrics }) => {
        const attention = metrics.blockedCount + metrics.needsRevisionCount
        return <article key={account.id} className="shop-card"><div className="shop-card-head"><span className="shop-platform-mark temu">T</span><div><strong>{account.name}</strong><small>{account.merchantId || account.id}</small></div><span className={`shop-health ${account.status === "attention" ? "attention" : "healthy"}`}>{account.status === "attention" ? "需要关注" : "运行正常"}</span></div>
          <dl><div><dt>销售平台</dt><dd>{account.platform === "temu" ? "Temu" : account.platform}</dd></div><div><dt>发布渠道</dt><dd>{channelLabels[account.channel]}</dd></div><div><dt>站点</dt><dd>{account.siteCode === "legacy-unknown" ? "待真实页面确认" : account.siteCode}</dd></div><div><dt>店铺模式</dt><dd>{account.shopMode === "semi-managed" ? "半托管" : account.shopMode}</dd></div></dl>
          <div className="shop-capabilities">{account.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div>
          <div className="shop-metrics"><div><strong>{metrics.workItemCount}</strong><span>任务</span></div><div><strong>{metrics.readyCount}</strong><span>已就绪</span></div><div><strong>{metrics.editedCount}</strong><span>已编辑</span></div><div><strong>{attention}</strong><span>待处理</span></div></div>
        </article>
      })}</div> : <div className="catalog-empty">尚未识别到店铺账号。</div>}
    </section>
    <section className="shop-coming-soon"><span className="shop-platform-mark tiktok">♪</span><div><strong>TikTok Shop</strong><p>能力注册表当前为研究阶段，尚未创建店铺账号。</p></div><span>写能力关闭</span></section>
  </main>
}

