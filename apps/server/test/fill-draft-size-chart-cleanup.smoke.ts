import { strict as assert } from "node:assert"
import { chromium } from "playwright"
import { normalizeSizeChart } from "../../automation/src/adapters/dianxiaomi-adapter"

const buildBlockedClickFixture = () => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>Dianxiaomi Dry Run Fixture</title>
  <style>
    body { font-family: sans-serif; margin: 0; }
    .page-content.smt-content { position: relative; padding: 24px; min-height: 100vh; }
    .skuAttrSizeChart { margin-top: 24px; }
    .skuAttrSizeChart .link {
      display: inline-block;
      color: #1677ff;
      cursor: pointer;
      user-select: none;
      position: relative;
      z-index: 1;
    }
    .pointer-blocker {
      position: absolute;
      inset: 0;
      background: rgba(255,255,255,0.01);
      z-index: 5;
      pointer-events: auto;
    }
    .ant-modal { position: fixed; inset: 0; display: none; z-index: 20; }
    .ant-modal.ant-modal-open { display: block; }
    .ant-modal-mask { position: absolute; inset: 0; background: rgba(0,0,0,0.35); }
    .ant-modal-wrap {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ant-modal-content { background: #fff; width: 720px; border-radius: 8px; overflow: hidden; }
    .ant-modal-body { padding: 16px; }
    .modal-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
    .toolbar { display: flex; gap: 12px; margin-bottom: 16px; }
    .ant-select { border: 1px solid #d9d9d9; padding: 8px 12px; min-width: 160px; }
    .ant-select.selection-placeholder { color: #999; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #eee; padding: 8px; text-align: left; }
    input { width: 100%; box-sizing: border-box; padding: 6px 8px; }
    .footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    button { padding: 8px 14px; }
  </style>
</head>
<body>
  <div class="page-content smt-content">
    <div>
      <input name="title" value="Fixture title" />
      <textarea name="description">Fixture description</textarea>
      <button type="button">保存</button>
      <button type="button">发布</button>
    </div>
    <div class="skuAttrSizeChart">
      <span class="label">尺码表</span>
      <span class="link" id="size-chart-trigger">添加尺码表</span>
    </div>
    <div class="pointer-blocker" aria-hidden="true"></div>
  </div>

  <div class="ant-modal" id="size-chart-modal">
    <div class="ant-modal-mask"></div>
    <div class="ant-modal-wrap">
      <div class="ant-modal-content">
        <div class="ant-modal-body">
          <div class="modal-title">尺码表</div>
          <div class="toolbar">
            <div class="ant-select">女装上衣</div>
            <div class="ant-select selection-placeholder">---请选择引用模板---</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>尺码</th>
                <th>胸围全围</th>
                <th>衣长</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>XS</td>
                <td><input placeholder="请输入胸围" /></td>
                <td><input placeholder="请输入衣长" /></td>
              </tr>
              <tr>
                <td>S</td>
                <td><input placeholder="请输入胸围" /></td>
                <td><input placeholder="请输入衣长" /></td>
              </tr>
            </tbody>
          </table>
          <div class="footer">
            <button type="button" id="size-chart-confirm">确定</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const modal = document.getElementById("size-chart-modal");
    const trigger = document.getElementById("size-chart-trigger");
    const confirm = document.getElementById("size-chart-confirm");
    const openModal = () => modal.classList.add("ant-modal-open");
    const closeModal = () => modal.classList.remove("ant-modal-open");

    trigger.addEventListener("mousedown", openModal);
    confirm.addEventListener("click", closeModal);
  </script>
</body>
</html>`

const buildResidualDialogFixture = () => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>Dianxiaomi Dry Run Fixture</title>
  <style>
    body { font-family: sans-serif; margin: 0; }
    .page-content.smt-content { position: relative; padding: 24px; min-height: 100vh; }
    .skuAttrSizeChart { margin-top: 24px; }
    .skuAttrSizeChart .link { display: inline-block; color: #1677ff; cursor: pointer; }
    .ant-modal { position: fixed; inset: 0; display: none; z-index: 20; }
    .ant-modal.ant-modal-open { display: block; }
    .ant-modal-mask { position: absolute; inset: 0; background: rgba(0,0,0,0.35); }
    .ant-modal-wrap {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ant-modal-content { background: #fff; width: 720px; border-radius: 8px; overflow: hidden; }
    .ant-modal-body { padding: 16px; }
    .modal-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
    .toolbar { display: flex; gap: 12px; margin-bottom: 16px; }
    .ant-select { border: 1px solid #d9d9d9; padding: 8px 12px; min-width: 160px; }
    .ant-select.selection-placeholder { color: #999; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #eee; padding: 8px; text-align: left; }
    input { width: 100%; box-sizing: border-box; padding: 6px 8px; }
    .footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    button { padding: 8px 14px; }
    #desc-modal { z-index: 40; }
  </style>
</head>
<body>
  <div class="page-content smt-content">
    <div>
      <input name="title" value="Fixture title" />
      <textarea name="description">Fixture description</textarea>
      <button type="button">保存</button>
      <button type="button">发布</button>
    </div>
    <div class="skuAttrSizeChart">
      <span class="label">尺码表</span>
      <span class="link" id="size-chart-trigger">添加尺码表</span>
    </div>
  </div>

  <div class="ant-modal ant-modal-open" id="desc-modal">
    <div class="ant-modal-mask"></div>
    <div class="ant-modal-wrap">
      <div class="ant-modal-content">
        <div class="ant-modal-body">
          <div class="modal-title">Temu产品描述</div>
          <div style="margin-bottom: 16px;">这里是残留的描述编辑弹窗</div>
          <div class="footer">
            <button type="button" id="desc-close">关闭</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="ant-modal" id="size-chart-modal">
    <div class="ant-modal-mask"></div>
    <div class="ant-modal-wrap">
      <div class="ant-modal-content">
        <div class="ant-modal-body">
          <div class="modal-title">尺码表</div>
          <div class="toolbar">
            <div class="ant-select">女装上衣</div>
            <div class="ant-select selection-placeholder">---请选择引用模板---</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>尺码</th>
                <th>胸围全围</th>
                <th>衣长</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>XS</td>
                <td><input placeholder="请输入胸围" /></td>
                <td><input placeholder="请输入衣长" /></td>
              </tr>
              <tr>
                <td>S</td>
                <td><input placeholder="请输入胸围" /></td>
                <td><input placeholder="请输入衣长" /></td>
              </tr>
            </tbody>
          </table>
          <div class="footer">
            <button type="button" id="size-chart-confirm">确定</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const descModal = document.getElementById("desc-modal");
    const descClose = document.getElementById("desc-close");
    const sizeChartModal = document.getElementById("size-chart-modal");
    const sizeChartTrigger = document.getElementById("size-chart-trigger");
    const sizeChartConfirm = document.getElementById("size-chart-confirm");
    descClose.addEventListener("click", () => descModal.classList.remove("ant-modal-open"));
    sizeChartTrigger.addEventListener("click", () => sizeChartModal.classList.add("ant-modal-open"));
    sizeChartConfirm.addEventListener("click", () => sizeChartModal.classList.remove("ant-modal-open"));
  </script>
</body>
</html>`

const run = async () => {
  const browser = await chromium.launch({
    headless: true
  })

  try {
    const page = await browser.newPage({
      viewport: {
        width: 1440,
        height: 960
      }
    })
    await page.setContent(buildBlockedClickFixture(), {
      waitUntil: "domcontentloaded"
    })

    const result = await normalizeSizeChart(page)
    assert.equal(result.status, "done", "size chart normalization should succeed even when pointer events block normal click")
    assert.equal(result.data?.triggerOpenMethod, "native-mouse", "size chart trigger should fall back to native mouse dispatch")
    const blockedSurface = result.data?.triggerSurfaceDiagnostics as {
      visibleDialogCount?: number
      trigger?: {
        topHitLooksLikeTrigger?: boolean
        hitTestTopElements?: Array<Record<string, unknown>>
      }
    } | undefined
    assert.equal(blockedSurface?.visibleDialogCount, 0, "blocked-click fixture should start without any open dialogs")
    assert.ok(Array.isArray(blockedSurface?.trigger?.hitTestTopElements), "size chart diagnostics should record hit-test elements around the trigger")
    assert.equal(blockedSurface?.trigger?.topHitLooksLikeTrigger, false, "diagnostics should show another element intercepting the trigger before fallback")

    const triggerAttempts = Array.isArray(result.data?.triggerOpenAttempts)
      ? result.data?.triggerOpenAttempts as Array<Record<string, unknown>>
      : []
    assert.equal(triggerAttempts.length, 3, "size chart trigger should record all fallback attempts")
    assert.equal(triggerAttempts[0]?.method, "idle-click")
    assert.equal(triggerAttempts[1]?.method, "force-click")
    assert.equal(triggerAttempts[2]?.method, "native-mouse")
    assert.equal(triggerAttempts[2]?.outcome, "opened", "native mouse fallback should open the modal")

    const openDialogs = await page.locator(".ant-modal.ant-modal-open").count()
    assert.equal(openDialogs, 0, "size chart normalization should not leave the modal open")

    await page.setContent(buildResidualDialogFixture(), {
      waitUntil: "domcontentloaded"
    })
    const residualDialogResult = await normalizeSizeChart(page)
    assert.equal(residualDialogResult.status, "done", "size chart normalization should recover when a non-size-chart modal is already open")
    assert.equal(residualDialogResult.data?.triggerOpenMethod, "idle-click", "size chart should open normally after the residual modal is dismissed")
    const residualTopmost = residualDialogResult.data?.triggerTopmostBeforeOpen as {
      closed?: boolean
      dialogText?: string
      surfaceBeforeClose?: {
        visibleDialogCount?: number
      }
      surfaceAfterClose?: {
        visibleDialogCount?: number
      }
    } | undefined
    assert.equal(
      residualTopmost?.closed,
      true,
      "size chart normalization should close the topmost non-size-chart modal before opening the size chart"
    )
    assert.match(
      String(residualTopmost?.dialogText ?? ""),
      /Temu.*产品描述|产品描述/i,
      "size chart normalization should report which residual modal was dismissed"
    )
    assert.ok((residualTopmost?.surfaceBeforeClose?.visibleDialogCount ?? 0) >= 1, "diagnostics should record the pre-close residual dialog")
    assert.equal(residualTopmost?.surfaceAfterClose?.visibleDialogCount, 0, "diagnostics should record that the residual dialog was cleared")
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
