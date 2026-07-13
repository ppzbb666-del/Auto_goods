import { useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import type { PublishTask } from "@temu-ai-ops/shared"

type DockTab = "steps" | "pricing" | "risks"

const FAB_SIZE = 56
const PANEL_W = 360
const DRAG_THRESHOLD = 5

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function TaskInsightsDock({ task }: { task: PublishTask }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<DockTab>("steps")
  const [pos, setPos] = useState(() => ({
    x: Math.max(16, window.innerWidth - FAB_SIZE - 24),
    y: Math.max(16, window.innerHeight - FAB_SIZE - 24)
  }))
  const drag = useRef<{ startX: number; startY: number; offX: number; offY: number; moved: boolean } | null>(null)

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    drag.current = { startX: event.clientX, startY: event.clientY, offX: event.clientX - pos.x, offY: event.clientY - pos.y, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = drag.current
    if (!state) return
    if (!state.moved && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > DRAG_THRESHOLD) {
      state.moved = true
    }
    setPos({
      x: clamp(event.clientX - state.offX, 8, window.innerWidth - FAB_SIZE - 8),
      y: clamp(event.clientY - state.offY, 8, window.innerHeight - FAB_SIZE - 8)
    })
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = drag.current
    drag.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (state && !state.moved) setOpen((value) => !value)
  }

  // 浮层锚定在球的一侧，并夹在视口内
  const anchorLeft = pos.x > window.innerWidth / 2 ? pos.x - PANEL_W - 12 : pos.x + FAB_SIZE + 12
  const panelLeft = clamp(anchorLeft, 8, window.innerWidth - PANEL_W - 8)
  const panelTop = clamp(pos.y - 8, 8, window.innerHeight - 160)
  const panelMaxHeight = Math.min(window.innerHeight * 0.7, window.innerHeight - panelTop - 16)

  return (
    <>
      {open ? (
        <div className="task-dock-panel" style={{ left: panelLeft, top: panelTop, maxHeight: panelMaxHeight }}>
          <div className="task-dock-head">
            <div className="task-dock-tabs">
              <button type="button" className={"task-dock-tab " + (tab === "steps" ? "active" : "")} onClick={() => setTab("steps")}>执行步骤</button>
              <button type="button" className={"task-dock-tab " + (tab === "risks" ? "active" : "")} onClick={() => setTab("risks")}>
                风险提醒{task.risks.length > 0 ? " (" + String(task.risks.length) + ")" : ""}
              </button>
              <button type="button" className={"task-dock-tab " + (tab === "pricing" ? "active" : "")} onClick={() => setTab("pricing")}>核价说明</button>
            </div>
            <button type="button" className="task-dock-close" aria-label="关闭" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className="task-dock-body">
            {tab === "steps" ? (
              <div className="flow-list">
                {task.steps.map((step) => (
                  <div key={step.id} className={"flow-item step-" + step.status}>
                    <strong>{step.title}</strong>
                    <p>{step.instruction}</p>
                    <span>{step.status}</span>
                  </div>
                ))}
              </div>
            ) : tab === "pricing" ? (
              <div className="explain-list">{task.pricing.rationale.map((item) => <div key={item} className="explain-item">{item}</div>)}</div>
            ) : (
              <div className="risk-list-simple">
                {task.risks.length > 0
                  ? task.risks.map((risk) => <div key={risk.id} className={"risk-pill " + risk.level}>{risk.message}</div>)
                  : <div className="empty-report">暂无风险提醒</div>}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className={"task-dock-fab " + (open ? "open" : "")}
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="步骤 / 核价 / 风险"
        title="步骤 / 核价 / 风险（可拖动）"
      >
        <span className="task-dock-fab-icon" aria-hidden="true">☰</span>
        {task.risks.length > 0 ? <span className="task-dock-fab-badge">{task.risks.length}</span> : null}
      </button>
    </>
  )
}
