import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { PublishTask } from "@temu-ai-ops/shared"
import { fetchTasks } from "../api"
import { getTaskProgress, statusLabel } from "../lib/dashboard-helpers"

type TaskFilter = "all" | PublishTask["status"]

export function TaskCenter() {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<TaskFilter>("all")
  const tasksQuery = useQuery({ queryKey: ["task-center"], queryFn: fetchTasks, refetchInterval: 10_000 })
  const tasks = tasksQuery.data ?? []
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filtered = tasks.filter((task) => {
    if (status !== "all" && task.status !== status) return false
    if (!normalizedSearch) return true
    return [task.id, task.product.id, task.product.title, task.product.sourceUrl]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedSearch))
  })
  const runningCount = tasks.filter((task) => task.status === "executing").length
  const failedCount = tasks.filter((task) => task.status === "failed" || task.status === "rejected").length
  const readyCount = tasks.filter((task) => task.status === "approved" || task.status === "planned").length

  return <main className="task-center-workspace">
    <section className="catalog-heading"><div><p className="eyebrow">Publishing Tasks</p><h1>任务中心</h1><p>统一查看跨平台发布任务。当前任务全部来自现有 Temu 工作流。</p></div><span className="catalog-readonly">只读兼容模式</span></section>
    <section className="task-summary"><div><span>全部任务</span><strong>{tasks.length}</strong></div><div><span>执行中</span><strong>{runningCount}</strong></div><div><span>等待执行</span><strong>{readyCount}</strong></div><div><span>失败或驳回</span><strong>{failedCount}</strong></div></section>
    <section className="catalog-panel">
      <div className="catalog-toolbar"><label className="catalog-search"><span>搜索</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="任务、商品名称或链接" /></label><label><span>任务状态</span><select value={status} onChange={(event) => setStatus(event.target.value as TaskFilter)}><option value="all">全部状态</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="catalog-count"><strong>{filtered.length}</strong><span>条结果</span></div></div>
      {tasksQuery.isLoading ? <div className="catalog-empty">正在加载任务...</div> : tasksQuery.isError ? <div className="catalog-empty error">任务加载失败，请确认服务端已启动。</div> : filtered.length ? <div className="task-list">{filtered.map((task) => {
        const progress = getTaskProgress(task)
        const completedSteps = task.steps.filter((step) => step.status === "done").length
        const highRisks = task.risks.filter((risk) => risk.level === "high").length
        return <article key={task.id} className="task-row"><div className="task-platform-cell"><span className="shop-platform-mark temu">T</span><div><strong>{task.product.title}</strong><small>{task.id}</small></div></div><div className="task-channel"><span>Temu</span><small>店小秘浏览器</small></div><div className="task-progress"><div><span>执行进度</span><strong>{completedSteps}/{task.steps.length}</strong></div><span className="task-progress-track"><i style={{ width: `${progress}%` }} /></span></div><div className={`task-status ${task.status}`}>{statusLabel[task.status]}</div><div className="task-risk"><strong>{highRisks}</strong><span>高风险</span></div><time>{new Date(task.updatedAt).toLocaleString()}</time></article>
      })}</div> : <div className="catalog-empty">没有符合条件的任务。</div>}
    </section>
  </main>
}
