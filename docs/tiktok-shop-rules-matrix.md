# TikTok Shop 商品发布规则矩阵

状态：研究基线，尚未进入自动发布门禁

最后检查：2026-07-12

## 官方来源状态

| 来源 | 地址 | 访问结果 | 用途 |
|---|---|---|---|
| TikTok Shop Partner Center | https://partner.tiktokshop.com/docv2/ | 可访问 | Developer Guide、API Reference、Webhooks、Terms and Policies、Changelog、FAQs 和 API 测试工具的官方入口 |
| Partner Center 历史页面 | https://partner.tiktokshop.com/docv2/page/6502f2e50d429e02b853b3b6 | 页面返回“没有这个文件” | 不得继续作为商品创建接口依据 |
| TikTok Shop US Seller University | https://seller-us.tiktok.com/university/home | 本次访问超时 | 后续核对美国站卖家侧刊登和合规要求 |

Partner Center 在公开未登录页面能够确认其提供 Developer Guide、API Reference、Webhooks、Terms and Policies、Changelog、FAQs、API 测试工具及 US/SEA/UK/JP/Latam 等区域内容。具体商品接口正文需要有效的 Partner Center 文档链接或登录后的开发者权限进一步核验。

## 接入范围

第一版只计划：

1. 标准商品转换为 TikTok Shop 草稿。
2. 类目和属性校验。
3. 图片、SKU、价格、库存、重量尺寸和合规预检。
4. 创建草稿并读取审核状态。
5. 人工确认最终发布。

第一版不承诺库存同步、订单、物流履约、自动改价或完全无人值守发布。

## 规则矩阵

| 领域 | 需要确认的规则 | 当前状态 | 自动化处理 |
|---|---|---|---|
| 店铺模式 | 跨境店、本土店及不同国家站点的账号能力差异 | `unverified` | 不阻断，仅禁止启用 TikTok 发布适配器 |
| 授权 | 应用授权、店铺授权、访问令牌与刷新机制 | `unverified` | 未授权时不创建任何写任务 |
| 类目 | 类目树、叶子类目要求、类目准入和资质 | `unverified` | 必须从官方类目接口实时读取，不写死 ID |
| 属性 | 类目必填属性、属性值和单位 | `unverified` | 适配器完成前只展示缺口 |
| 品牌 | 品牌 ID、无品牌商品和品牌授权要求 | `unverified` | 不根据商品标题猜测品牌授权 |
| 标题 | 字符限制、禁用词、语言和重复信息要求 | `unverified` | 不设置固定长度门禁 |
| 描述 | 富文本、图片、语言和禁止内容要求 | `unverified` | 只保留标准商品内容，不生成平台最终载荷 |
| 图片 | 数量、格式、尺寸、比例、大小、文字和水印要求 | `unverified` | 不复用 Temu 图片阈值作为 TikTok 阈值 |
| 视频 | 格式、时长、尺寸、大小和类目要求 | `unverified` | 第一版设为可选能力 |
| SKU | 变体数量、销售属性组合、Seller SKU 和条码要求 | `unverified` | 不自动截断或合并 SKU |
| 价格 | 币种、价格区间、最低价和促销限制 | `unverified` | 未获得站点币种前不换算发布价 |
| 库存 | 仓库、可售库存和库存上限 | `unverified` | 第一版只创建草稿，不同步库存 |
| 包裹 | 重量、长宽高、单位和类目范围 | `unverified` | 缺少真实数据时阻止生成最终载荷 |
| 合规 | 产地、制造商、责任人、认证、警告和危险品 | `unverified` | 缺少类目证据时要求人工确认 |
| 审核 | 草稿、审核中、已发布、驳回和冻结状态 | `unverified` | 必须映射官方状态机后才可自动回写 |
| 频率限制 | 接口调用频率、批量上限和重试策略 | `unverified` | 未确认前禁止批量并发写入 |
| 错误码 | 参数、权限、风控、类目和审核错误分类 | `unverified` | 未映射错误码前不自动重试写请求 |

## 禁止的假设

- 不把 Temu 或店小秘的字段限制直接复制到 TikTok Shop。
- 不假设美国站、东南亚站、英国站和本土店规则一致。
- 不假设所有店铺都有商品创建、发布、库存和价格权限。
- 不通过浏览器页面绕过官方授权、验证码、审核或风控。
- 不把论坛、培训课程或运营经验标记为官方强制规则。
- 不把已经失效的 Partner Center 页面作为实现依据。

## 规则入库标准

一条 TikTok Shop 规则只有同时具备以下信息，才能从 `unverified` 升级：

- 官方文档或官方后台来源
- 适用国家/站点
- 店铺模式
- 文档标题和 URL
- 检查日期或生效日期
- 对应接口字段或后台字段
- 是否经过真实草稿验证

只有 `mandatory` 和已经真实验证的 `observed` 规则可以成为自动阻断条件。

## 下一次研究任务

1. 确认实际接入的国家站点和店铺模式。
2. 使用真实 Partner Center 开发者账号定位最新商品 API Reference。
3. 从官方类目接口采样至少三个目标类目。
4. 创建一个无发布动作的开发店铺草稿请求。
5. 记录请求字段、响应状态、错误码和审核状态。

