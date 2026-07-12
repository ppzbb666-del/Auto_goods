import { useQuery } from "@tanstack/react-query"
import { fetchDianxiaomiRequirementRules } from "../api"

const tiktokResearchItems = [
  ["店铺与站点", "跨境/本土店、目标国家和账号权限"],
  ["类目与资质", "类目准入、品牌授权、认证和责任人信息"],
  ["商品内容", "标题、描述、属性、敏感词和本地化要求"],
  ["图片与视频", "主图、白底图、尺寸、文字和视频规范"],
  ["SKU 与定价", "变体组合、价格区间、库存、重量和尺寸"],
  ["发布接口", "开放 API 权限、频率限制、审核状态和错误码"]
] as const

export function RuleCenter() {
  const rulesQuery = useQuery({ queryKey: ["rule-center", "temu"], queryFn: fetchDianxiaomiRequirementRules, staleTime: 30_000 })
  const rules = rulesQuery.data
  const temuRuleItems = rules ? [
    ["标题", `${rules.title.minLength}-${rules.title.maxLength} 字符${rules.title.required ? "，必填" : ""}`],
    ["商品图片", `至少 ${rules.images.minCount} 张${rules.images.required ? "，必填" : ""}`],
    ["媒体处理", `${rules.media.requireImageTranslation ? "翻译 " : ""}${rules.media.requireWhiteBackground ? "白底 " : ""}${rules.media.requireSizeNormalization ? "尺寸归一 " : ""}`.trim() || "按需处理"],
    ["SKU", `至少 ${rules.sku.minCount} 个${rules.sku.required ? "，必填" : ""}`],
    ["价格", `至少 ${rules.price.minEditableFieldCount} 个可编辑价格字段`],
    ["库存", `至少 ${rules.stock.minEditableFieldCount} 个可编辑库存字段`],
    ["推荐属性", `${rules.attributes.recommendedKeys.length} 项`],
    ["禁用词", `${rules.compliance.blockedTerms.length} 项`]
  ] : []

  return <main className="rule-workspace">
    <section className="catalog-heading"><div><p className="eyebrow">Platform Rules</p><h1>模板与规则</h1><p>集中管理平台刊登要求、规则来源和验证状态。</p></div><span className="catalog-readonly">只读兼容模式</span></section>
    <section className="rule-principles"><div><strong>强制规则</strong><span>官方明确要求，不满足时阻止发布</span></div><div><strong>平台建议</strong><span>用于优化质量，但允许继续</span></div><div><strong>实测经验</strong><span>经真实后台和小批量发布验证</span></div><div><strong>待验证</strong><span>仅作研究提醒，不参与自动判断</span></div></section>
    <section className="rule-platform-panel">
      <div className="rule-platform-head"><span className="shop-platform-mark temu">T</span><div><strong>Temu / 店小秘</strong><small>{rules?.presetName ?? "正在加载规则配置"}</small></div><span className="rule-verified">当前已启用</span></div>
      {rulesQuery.isLoading ? <div className="catalog-empty">正在加载 Temu 规则...</div> : rulesQuery.isError ? <div className="catalog-empty error">Temu 规则加载失败。</div> : <><div className="rule-grid">{temuRuleItems.map(([name, detail]) => <div key={name}><span>{name}</span><strong>{detail}</strong><small>现有生产规则</small></div>)}</div><div className="rule-meta"><span>目标语言：{rules?.media.targetLanguage || "未设置"}</span><span>媒体工具：{rules?.media.dianxiaomiTools.length ?? 0} 个</span><span>类目覆盖：{Object.keys(rules?.categoryRules ?? {}).length} 项</span></div></>}
    </section>
    <section className="rule-platform-panel pending">
      <div className="rule-platform-head"><span className="shop-platform-mark tiktok">♪</span><div><strong>TikTok Shop</strong><small>第二接入平台</small></div><span className="rule-pending">官方规则研究中</span></div>
      <div className="rule-research-list">{tiktokResearchItems.map(([name, detail]) => <div key={name}><span>待验证</span><div><strong>{name}</strong><small>{detail}</small></div></div>)}</div>
      <p className="rule-notice">在目标站点、店铺模式和官方来源确认前，这些项目不会进入自动发布门禁。</p>
    </section>
  </main>
}

