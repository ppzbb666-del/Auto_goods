import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { PublishingTaskStatus } from "@temu-ai-ops/shared"
import { fetchPublishingTasks } from "../api"

type TaskFilter = "all" | PublishingTaskStatus

const statusLabels: Record<PublishingTaskStatus, string> = {
  queued: "排队中",
  preparing: "准备中",
  ready: "已就绪",
  running: "执行中",
  reviewing: "审核中",
  completed: "已完成",
  failed: "失败"
}

export function TaskCenter() {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<TaskFilter>("all")
  const tasksQuery = useQuery({ queryKey: ["publishing-tasks"], queryFn: fetchPublishingTasks, refetchInterval: 10_000 })
  const tasks = tasksQuery.data ?? []
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filtered = tasks.filter((task) => {
    if (status !== "all" && task.status !== status) return false
    if (!normalizedSearch) return true
    return [task.id, task.legacyTaskId, task.productId, task.productTitle]
      .some((value) => value.toLocaleLowerCase().includes(normalizedSearch))
  })
  const runningCount = tasks.filter((task) => task.status === "running").length
  const failedCount = tasks.filter((task) => task.status === "failed").length
  const readyCount = tasks.filter((task) => task.status === "ready" || task.status === "preparing").length

  return <main className="task-center-workspace">
    <section className="catalog-heading"><div><p className="eyebrow">Publishing Tasks</p><h1>任务中心</h1><p>使用统一发布任务模型查看平台、渠道、进度、风险和写能力状态。</p></div><span className="catalog-readonly">只读兼容模式</span></section>
    <section className="task-summary"><div><span>全部任务</span><strong>{tasks.length}</strong></div><div><span>执行中</span><strong>{runningCount}</strong></div><div><span>等待执行</span><strong>{readyCount}</strong></div><div><span>失败</span><strong>{failedCount}</strong></div></section>
    <section className="catalog-panel"><div className="catalog-toolbar"><label className="catalog-search"><span>搜索</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="任务 ID、商品 ID 或商品名称" /></label><label><span>任务状态</span><select value={status} onChange={(event) => setStatus(event.target.value as TaskFilter)}><option value="all">全部状态</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="catalog-count"><strong>{filtered.length}</strong><span>条结果</span></div></div>
      {tasksQuery.isLoading ? <div className="catalog-empty">正在加载任务...</div> : tasksQuery.isError ? <div className="catalog-empty error">统一任务接口加载失败，请确认服务端已启动。</div> : filtered.length ? <div className="task-list">{filtered.map((task) => <article key={task.id} className="task-row"><div className="task-platform-cell"><span className="shop-platform-mark temu">T</span><div><strong>{task.productTitle}</strong><small>{task.id}</small></div></div><div className="task-channel"><span>{task.platform === "temu" ? "Temu" : task.platform}</span><small>{task.channel === "dianxiaomi-browser" ? "店小秘浏览器" : task.channel}</small></div><div className="task-progress"><div><span>执行进度</span><strong>{task.progress.completedSteps}/{task.progress.totalSteps}</strong></div><span className="task-progress-track"><i style={{ width: `${task.progress.percent}%` }} /></span></div><div className={`task-status ${task.status}`}>{statusLabels[task.status]}</div><div className="task-risk"><strong>{task.risks.high}</strong><span>高风险</span></div><div className="task-write-state"><span className={task.writeEnabled ? "enabled" : "disabled"}>{task.writeEnabled ? "写能力开启" : "只读"}</span><time>{new Date(task.updatedAt).toLocaleString()}</time></div></article>)}</div> : <div className="catalog-empty">没有符合条件的任务。</div>}
    </section>
  </main>
}

