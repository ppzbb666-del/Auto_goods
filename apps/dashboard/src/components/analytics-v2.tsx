import { useQuery } from "@tanstack/react-query"
import type { PublishingTaskStatus } from "@temu-ai-ops/shared"
import { fetchPublishingTasks, fetchShopAccounts } from "../api"

const statusLabels: Record<PublishingTaskStatus, string> = {
  queued: "排队中",
  preparing: "准备中",
  ready: "已就绪",
  running: "执行中",
  reviewing: "审核中",
  completed: "已完成",
  failed: "失败"
}

const percentage = (value: number, total: number) => total ? Math.round(value / total * 100) : 0

export function AnalyticsCenter() {
  const tasksQuery = useQuery({ queryKey: ["analytics-v2", "tasks"], queryFn: fetchPublishingTasks, refetchInterval: 15_000 })
  const shopsQuery = useQuery({ queryKey: ["analytics-v2", "shops"], queryFn: fetchShopAccounts, refetchInterval: 15_000 })
  const tasks = tasksQuery.data ?? []
  const shops = shopsQuery.data ?? []
  const completed = tasks.filter((task) => task.status === "completed").length
  const failed = tasks.filter((task) => task.status === "failed").length
  const active = tasks.filter((task) => task.status === "running" || task.status === "ready" || task.status === "preparing").length
  const totalAttention = shops.reduce((sum, shop) => sum + shop.metrics.blockedCount + shop.metrics.needsRevisionCount, 0)
  const statusCounts = tasks.reduce<Partial<Record<PublishingTaskStatus, number>>>((counts, task) => {
    counts[task.status] = (counts[task.status] ?? 0) + 1
    return counts
  }, {})
  const platformCounts = tasks.reduce<Record<string, number>>((counts, task) => {
    counts[task.platform] = (counts[task.platform] ?? 0) + 1
    return counts
  }, {})
  const maxStatus = Math.max(1, ...Object.values(statusCounts))
  const totalRisks = tasks.reduce((counts, task) => ({
    low: counts.low + task.risks.low,
    medium: counts.medium + task.risks.medium,
    high: counts.high + task.risks.high
  }), { low: 0, medium: 0, high: 0 })

  return <main className="analytics-workspace">
    <section className="catalog-heading"><div><p className="eyebrow">Operations Analytics</p><h1>数据分析</h1><p>基于统一发布任务和店铺账号模型生成跨平台运营概览。</p></div><span className="catalog-readonly">统一数据视图</span></section>
    <section className="analytics-kpis"><div><span>统一发布任务</span><strong>{tasks.length}</strong><small>{active} 个等待或执行中</small></div><div><span>完成率</span><strong>{percentage(completed, tasks.length)}%</strong><small>{completed} 个已完成</small></div><div><span>失败率</span><strong>{percentage(failed, tasks.length)}%</strong><small>{failed} 个失败</small></div><div><span>店铺待处理</span><strong>{totalAttention}</strong><small>{shops.length} 个统一店铺账号</small></div></section>
    <section className="analytics-grid">
      <article className="analytics-panel"><div className="analytics-panel-head"><strong>统一任务状态</strong><span>全部已接入平台</span></div>{tasksQuery.isLoading ? <div className="catalog-empty">正在加载...</div> : <div className="analytics-bars">{Object.entries(statusCounts).map(([status, count]) => <div key={status}><span>{statusLabels[status as PublishingTaskStatus]}</span><i><b style={{ width: `${count / maxStatus * 100}%` }} /></i><strong>{count}</strong></div>)}{tasks.length === 0 ? <p>暂无任务数据</p> : null}</div>}</article>
      <article className="analytics-panel"><div className="analytics-panel-head"><strong>风险概览</strong><span>统一任务风险项</span></div><div className="risk-overview"><div className="high"><strong>{totalRisks.high}</strong><span>高风险</span></div><div className="medium"><strong>{totalRisks.medium}</strong><span>中风险</span></div><div className="low"><strong>{totalRisks.low}</strong><span>低风险</span></div></div><p className="analytics-note">风险来自原任务规则检查，平台适配器接入后会叠加平台级规则。</p></article>
      <article className="analytics-panel"><div className="analytics-panel-head"><strong>平台任务结构</strong><span>能力注册表范围</span></div><div className="source-overview">{Object.entries(platformCounts).map(([platform, count]) => <div key={platform}><span>{platform === "temu" ? "Temu" : platform}</span><strong>{count}</strong><small>{percentage(count, tasks.length)}%</small></div>)}{tasks.length === 0 ? <p>暂无平台任务</p> : null}</div></article>
      <article className="analytics-panel"><div className="analytics-panel-head"><strong>统一店铺健康</strong><span>全部已接入账号</span></div>{shopsQuery.isLoading ? <div className="catalog-empty">正在加载...</div> : <div className="store-health-list">{shops.map(({ account, metrics }) => { const attention = metrics.blockedCount + metrics.needsRevisionCount; return <div key={account.id}><div><strong>{account.name}</strong><small>{account.platform} / ready {metrics.readyCount} / tasks {metrics.workItemCount}</small></div><span className={attention ? "attention" : "healthy"}>{attention ? `${attention} 待处理` : "正常"}</span></div> })}{shops.length === 0 ? <p>暂无店铺数据</p> : null}</div>}</article>
    </section>
  </main>
}

