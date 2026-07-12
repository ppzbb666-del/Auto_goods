import { useQuery } from "@tanstack/react-query"
import type { PublishTask } from "@temu-ai-ops/shared"
import { fetchDianxiaomiStoreMetrics, fetchTasks } from "../api"
import { statusLabel } from "../lib/dashboard-helpers"

const percentage = (value: number, total: number) => total ? Math.round(value / total * 100) : 0

export function AnalyticsCenter() {
  const tasksQuery = useQuery({ queryKey: ["analytics", "tasks"], queryFn: fetchTasks, refetchInterval: 15_000 })
  const storesQuery = useQuery({ queryKey: ["analytics", "stores"], queryFn: fetchDianxiaomiStoreMetrics, refetchInterval: 15_000 })
  const tasks = tasksQuery.data ?? []
  const stores = storesQuery.data ?? []
  const completed = tasks.filter((task) => task.status === "completed").length
  const failed = tasks.filter((task) => task.status === "failed" || task.status === "rejected").length
  const active = tasks.filter((task) => task.status === "executing" || task.status === "planned" || task.status === "approved").length
  const riskCounts = tasks.reduce((counts, task) => {
    task.risks.forEach((risk) => { counts[risk.level] += 1 })
    return counts
  }, { low: 0, medium: 0, high: 0 })
  const sourceCounts = tasks.reduce<Partial<Record<PublishTask["product"]["source"], number>>>((counts, task) => {
    counts[task.product.source] = (counts[task.product.source] ?? 0) + 1
    return counts
  }, {})
  const statusCounts = tasks.reduce<Partial<Record<PublishTask["status"], number>>>((counts, task) => {
    counts[task.status] = (counts[task.status] ?? 0) + 1
    return counts
  }, {})
  const maxStatus = Math.max(1, ...Object.values(statusCounts))
  const totalAttention = stores.reduce((sum, store) => sum + store.blockedCount + store.needsRevisionCount, 0)

  return <main className="analytics-workspace">
    <section className="catalog-heading"><div><p className="eyebrow">Operations Analytics</p><h1>数据分析</h1><p>基于当前任务、风险和店铺队列生成运营概览，不包含尚未接入的销售数据。</p></div><span className="catalog-readonly">实时只读</span></section>
    <section className="analytics-kpis"><div><span>任务总量</span><strong>{tasks.length}</strong><small>{active} 个等待或执行中</small></div><div><span>完成率</span><strong>{percentage(completed, tasks.length)}%</strong><small>{completed} 个已完成</small></div><div><span>失败率</span><strong>{percentage(failed, tasks.length)}%</strong><small>{failed} 个失败或驳回</small></div><div><span>店铺待处理</span><strong>{totalAttention}</strong><small>{stores.length} 个已识别店铺</small></div></section>
    <section className="analytics-grid">
      <article className="analytics-panel"><div className="analytics-panel-head"><strong>任务状态分布</strong><span>Temu 当前任务</span></div>{tasksQuery.isLoading ? <div className="catalog-empty">正在加载...</div> : <div className="analytics-bars">{Object.entries(statusCounts).map(([status, count]) => <div key={status}><span>{statusLabel[status as PublishTask["status"]]}</span><i><b style={{ width: `${count / maxStatus * 100}%` }} /></i><strong>{count}</strong></div>)}{tasks.length === 0 ? <p>暂无任务数据</p> : null}</div>}</article>
      <article className="analytics-panel"><div className="analytics-panel-head"><strong>风险概览</strong><span>当前任务风险项</span></div><div className="risk-overview"><div className="high"><strong>{riskCounts.high}</strong><span>高风险</span></div><div className="medium"><strong>{riskCounts.medium}</strong><span>中风险</span></div><div className="low"><strong>{riskCounts.low}</strong><span>低风险</span></div></div><p className="analytics-note">风险数量来自现有任务规则检查，不代表平台最终审核结果。</p></article>
      <article className="analytics-panel"><div className="analytics-panel-head"><strong>商品来源</strong><span>任务来源结构</span></div><div className="source-overview">{Object.entries(sourceCounts).map(([source, count]) => <div key={source}><span>{source}</span><strong>{count}</strong><small>{percentage(count, tasks.length)}%</small></div>)}{tasks.length === 0 ? <p>暂无来源数据</p> : null}</div></article>
      <article className="analytics-panel"><div className="analytics-panel-head"><strong>店铺健康</strong><span>店小秘工作队列</span></div>{storesQuery.isLoading ? <div className="catalog-empty">正在加载...</div> : <div className="store-health-list">{stores.map((store, index) => { const attention = store.blockedCount + store.needsRevisionCount; return <div key={store.storeId || store.storeName || String(index)}><div><strong>{store.storeName || `Temu 店铺 ${index + 1}`}</strong><small>ready {store.readyCount} / tasks {store.workItemCount}</small></div><span className={attention ? "attention" : "healthy"}>{attention ? `${attention} 待处理` : "正常"}</span></div> })}{stores.length === 0 ? <p>暂无店铺数据</p> : null}</div>}</article>
    </section>
  </main>
}

