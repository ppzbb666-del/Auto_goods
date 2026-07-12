import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { SalesPlatform } from "@temu-ai-ops/shared"
import { fetchCatalogProducts, fetchPlatformCapabilities, fetchShopAccounts } from "../api"

export function PublishCenter({ onOpenLegacyFlow }: { onOpenLegacyFlow: () => void }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [platform, setPlatform] = useState<SalesPlatform>("temu")
  const [shopAccountId, setShopAccountId] = useState("")
  const productsQuery = useQuery({ queryKey: ["publish-center-v2", "products"], queryFn: () => fetchCatalogProducts() })
  const shopsQuery = useQuery({ queryKey: ["publish-center-v2", "shops"], queryFn: fetchShopAccounts })
  const capabilitiesQuery = useQuery({ queryKey: ["publish-center-v2", "capabilities"], queryFn: fetchPlatformCapabilities })
  const products = productsQuery.data?.items ?? []
  const profiles = capabilitiesQuery.data ?? []
  const shops = (shopsQuery.data ?? []).filter((shop) => shop.account.platform === platform)
  const selectedProducts = useMemo(() => products.filter((product) => selectedIds.includes(product.id)), [products, selectedIds])
  const selectedProfile = profiles.find((profile) => profile.platform === platform)
  const missingImages = selectedProducts.filter((product) => product.media.imageUrls.length === 0).length
  const missingSkus = selectedProducts.filter((product) => product.skus.length === 0).length
  const ready = selectedProducts.length > 0 && Boolean(shopAccountId) && selectedProfile?.writeEnabled === true && missingImages === 0 && missingSkus === 0
  const toggleProduct = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const choosePlatform = (nextPlatform: SalesPlatform) => { setPlatform(nextPlatform); setShopAccountId("") }

  return <main className="publish-workspace">
    <section className="catalog-heading"><div><p className="eyebrow">Publishing Workspace</p><h1>发布中心</h1><p>使用统一商品、店铺和平台能力模型生成发布准备清单。</p></div><span className="catalog-readonly">安全预览</span></section>
    <section className="publish-steps"><div className={selectedIds.length ? "done" : "active"}><span>1</span><div><strong>选择商品</strong><small>{selectedIds.length} 件已选</small></div></div><i /><div className={shopAccountId ? "done" : selectedIds.length ? "active" : ""}><span>2</span><div><strong>选择平台与店铺</strong><small>{selectedProfile?.displayName ?? "等待能力数据"}</small></div></div><i /><div className={ready ? "active" : ""}><span>3</span><div><strong>检查与发布</strong><small>写能力必须由服务端开启</small></div></div></section>
    <section className="publish-layout"><article className="publish-panel"><div className="publish-panel-head"><div><strong>标准商品</strong><span>从统一商品目录选择</span></div><button onClick={() => setSelectedIds(selectedIds.length === products.length ? [] : products.map((product) => product.id))}>{selectedIds.length === products.length && products.length ? "取消全选" : "全选"}</button></div>{productsQuery.isLoading ? <div className="catalog-empty">正在加载商品...</div> : <div className="publish-product-list">{products.map((product) => <label key={product.id} className={selectedIds.includes(product.id) ? "selected" : ""}><input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleProduct(product.id)} />{product.media.mainImageUrl ? <img src={product.media.mainImageUrl} alt="" /> : <span className="publish-image-placeholder">无图</span>}<div><strong>{product.title}</strong><small>{product.skus.length} SKU / {product.categoryHint || "未归类"}</small></div></label>)}{products.length === 0 ? <div className="catalog-empty">暂无标准商品</div> : null}</div>}</article>
      <aside className="publish-side"><section className="publish-panel"><div className="publish-panel-head"><div><strong>平台能力</strong><span>由服务端能力注册表控制</span></div></div><div className="publish-platform-grid">{profiles.map((profile) => <button key={profile.platform} className={platform === profile.platform ? "selected" : ""} disabled={!profile.writeEnabled} onClick={() => choosePlatform(profile.platform)}><span className={`shop-platform-mark ${profile.platform === "temu" ? "temu" : "tiktok"}`}>{profile.platform === "temu" ? "T" : profile.displayName.slice(0, 1)}</span><div><strong>{profile.displayName}</strong><small>{profile.writeEnabled ? "写能力已开启" : profile.stage === "research" ? "研究中" : "规划中"}</small></div><i>{profile.writeEnabled ? "可用" : "禁用"}</i></button>)}</div><label className="publish-store-select"><span>目标店铺</span><select value={shopAccountId} onChange={(event) => setShopAccountId(event.target.value)} disabled={!selectedProfile?.writeEnabled}><option value="">请选择统一店铺账号</option>{shops.map(({ account }) => <option key={account.id} value={account.id}>{account.name} / {account.siteCode === "legacy-unknown" ? "站点待确认" : account.siteCode}</option>)}</select></label></section>
        <section className="publish-panel"><div className="publish-panel-head"><div><strong>发布前检查</strong><span>统一模型基础预检</span></div></div><div className="publish-checks"><div className={selectedProducts.length ? "pass" : "wait"}><span>{selectedProducts.length ? "✓" : "·"}</span><div><strong>标准商品</strong><small>{selectedProducts.length} 件已选</small></div></div><div className={selectedProfile?.writeEnabled ? "pass" : "fail"}><span>{selectedProfile?.writeEnabled ? "✓" : "!"}</span><div><strong>平台写能力</strong><small>{selectedProfile?.writeEnabled ? "服务端已开启" : selectedProfile?.blockers[0] || "等待能力数据"}</small></div></div><div className={shopAccountId ? "pass" : "wait"}><span>{shopAccountId ? "✓" : "·"}</span><div><strong>统一店铺账号</strong><small>{shopAccountId ? "目标已确定" : "等待选择"}</small></div></div><div className={missingImages || missingSkus ? "fail" : selectedProducts.length ? "pass" : "wait"}><span>{missingImages || missingSkus ? "!" : selectedProducts.length ? "✓" : "·"}</span><div><strong>基础资料</strong><small>{missingImages || missingSkus ? `缺图 ${missingImages} / 缺 SKU ${missingSkus}` : "图片和 SKU 基础检查通过"}</small></div></div></div><button className="publish-legacy-button" disabled={!ready || platform !== "temu"} onClick={onOpenLegacyFlow}>返回现有 Temu 流程继续</button><p className="publish-safety-note">新页面不创建任务；实际写操作继续由原 Temu 安全门禁执行。</p></section></aside>
    </section>
  </main>
}

