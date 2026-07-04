# OOM 缓解方案（浏览器自动化内存崩溃）

Updated: 2026-07-04（实测数据当日采集）

## 诊断

**症状**：Playwright Chromium 在 fill 阶段（variant-remap 大变体网格页）崩溃「possible OOM」。322 SKU 必崩；**新商品 62 SKU 也崩过**；只有 189 SKU 的老商品稳定跑完 → 崩溃与**宿主内存压力**强相关（方差大），不只是页面大小。

**宿主实测（2026-07-04）**：物理内存 15.2GB，空闲仅 ~2.8GB。pagefile 20GB 只用了 2GB（**不是瓶颈**）。大头占用：

| 进程 | 占用 | 可否跑批时关掉 |
|---|---|---|
| VS Code ×17 进程 | ~1.4GB | 可（留一个窗口） |
| Edge + WebView2 ×49 | ~1.5GB | 可 |
| 微信 Weixin+WeChatAppEx | ~0.8GB | 可 |
| Chrome ×9 | ~0.4GB | 可（非自动化用的那个） |
| Codex ×11 | ~0.3GB | 可 |

→ **跑批前关掉这些能回收 ~3.5-4GB，空闲从 2.8GB 升到 6GB+**。这是零代码、性价比最高的一步，很可能直接让 62 SKU 变稳、322 SKU 变可试。

**自动化自身的三个内存放大器**（代码侧）：

1. **fullPage 截图**：4 处 `fullPage: true`（[dianxiaomi-adapter.ts:8181](../apps/automation/src/adapters/dianxiaomi-adapter.ts#L8181)、:13460、:13592、[temu-publish.ts:32](../apps/automation/src/temu-publish.ts#L32)）。数百 SKU 的编辑页可能几万像素高，fullPage 截图是渲染进程里单次最大的内存尖峰。
2. **variant-remap ×5**：full-flow 每个阶段重开页面、重做 variant-remap（**dry-run 阶段也做**，已实锤），单品峰值内存事件发生 5 次而不是 1 次。
3. **无守门**：daemon 选品完全没有 SKU 上限或空闲内存检查，只能靠人工把大商品手动 block（当前就是这么挡的）。

## 分层方案

### 层 0 —— 操作者立刻做（零代码）

跑无人值守前关掉上表的进程。可选：把 daemon 跑批安排在不用这台机器的时段。

### 层 1 —— 代码防护（给 4.8，按性价比排序）

1. **去 fullPage 截图**：上述 4 处改视口截图（或加环境变量 `UNATTENDED_FULLPAGE_SCREENSHOTS`，默认 false；校准场景可显式开）。截图仍留证据，只是不再整页位图。
2. **SKU 上限门**：daemon tick / queue-run 选品时跳过 `snapshot.skuCount > UNATTENDED_MAX_SKU`（env，默认 200——操作者实测 189 稳 322 崩）的工作项，skippedItems 里记明确原因 `sku-count-over-cap`。**必须读已存的 snapshot.skuCount，不要开页面探**（dry-run 也会触发 variant-remap）。
3. **空闲内存预检**：tick 里 spawn full-flow 前查 `os.freemem()`，低于 `UNATTENDED_MIN_FREE_MEM_MB`（env，默认 3072）→ tick 记 `insufficient-memory` 类别并**加进 `queueDaemonSuccessfulCategories`**（不计连续失败），等下一轮。把中途崩溃变成干净等待。
4. **无人值守默认 headless**：daemon/队列路径 `headed=false`（校准与手动路径保持 headed）。省渲染合成开销，也避免操作者误关窗口。

验收：改完先用上次崩掉的 62-SKU 新商品重跑 full-flow（层 0 措施同时生效）；成功后再试 322 SKU。

### 层 2 —— 中期重构（立项，不阻塞当前）

**单会话 full-flow**：5 个阶段共用一次页面加载，variant-remap 从 5 次降到 1 次。峰值事件 -80%，单品耗时也从 15-20 分钟大幅下降。属 roadmap 级改动，等无人值守稳定运转后再做。

### 层 3 —— 根治（硬件）

这台 15.2GB 的机器如果是长期跑批宿主，**加内存到 32GB** 是让 322 SKU 稳定的唯一可靠路径（DDR4 16GB 条不贵）。或者把跑批挪到另一台内存充裕的机器（仓库已有 [new-machine-onboarding.md](new-machine-onboarding.md)）。

## 与在途修复的关系

层 1 的改动和此前待修的两个 daemon bug（awaiting-flow 分支挪到 startup-block 之前；queue-run 历史持久化）都在 `tickDianxiaomiQueueDaemon` 附近，建议 4.8 一并做掉，一次回归测试覆盖。
