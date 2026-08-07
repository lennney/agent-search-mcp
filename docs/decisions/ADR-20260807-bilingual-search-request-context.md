# ADR-20260807：统一双语搜索请求上下文

状态：Accepted
日期：2026-08-07

## Context

`free_search` 接受 `auto`、`en` 和 `zh`，但编排器过去只把语言用于响应元数据。各 adapter
分别根据 query 字符或固定 header/region 决定上游语言，因此显式语言、自动检测、缓存键和
真实 Provider 请求可能表达不同意图。一次 waterfall 的不同表示也可能使用不一致的市场
身份。

官方合同只支持有限映射：DuckDuckGo 公开 `kl` 区域值（包括 `us-en`、`cn-zh`），
Wikipedia 由语言子域选择检索语料。Bing 的公开说明证明语言会影响结果，但不足以把 API
市场参数当作 HTML 搜索合同。

## Decision

新增 `engines/search-request-context.ts`，在每个逻辑搜索入口只解析一次：

- 显式 `en` / `zh` 优先；`auto` 使用现有语言检测器；
- 产品双语范围之外或无法判断时回退英文；
- 生成稳定的 `language`、`region` 和 `Accept-Language`；
- 同一上下文传入 pending-request collapse、exact cache、重试、waterfall、query expansion
  和 Provider dispatcher。

DDG Web 只给 bootstrap URL 增加公开的 `kl`，不改写页面签发的 preload URL；HTML/Lite
沿用已有 `l` 字段并使用同一区域值。Wikipedia 使用上下文语言子域。Bing/Yandex 只消费
`Accept-Language`，不添加未经其 HTML 合同确认的市场参数。直接调用 adapter 且不传上下文
时继续使用原有默认值。

由于上游请求语义改变，exact cache key 升级到 `search-cache-key-v2`，并绑定解析后的语言
与区域。相同 query 的 `auto` 英文与显式英文可安全共享；英文与中文不得共享。

## Constraints

- 不改变 MCP 工具输入/输出 schema、Provider 集合或 provider-family；
- 不增加请求、重试、分页、代理、浏览器或依赖；
- DDG 同一逻辑查询保持稳定 User-Agent，challenge 仍立即停止表示回退；
- 中文原生 Provider 的固定语言行为不伪装成通用语言支持；
- 未来增加市场维度时必须扩展上下文和 cache version，不能从环境隐式推断。

## Consequences

编排层、缓存和首批多语言 adapter 现在共享一个可测试的请求意图，避免响应报告中文而上游
仍固定请求英文。代价是旧 exact cache 自动失效；这是有意的安全迁移，不读取或重写旧条目。
当前上下文只覆盖中英双语，日语、韩语和不确定输入按产品范围回退英文。

## Verification

- 上下文单元测试覆盖显式优先、自动检测、混合查询和范围外回退；
- cache key v2 按语言与区域隔离；
- DDG、Wikipedia、Bing、Yandex 使用 mock HTTP 验证 URL/header/body，零网络；
- 编排测试证明响应元数据与 Provider 收到同一上下文，且中英文并发请求不合并。

## References

- DuckDuckGo URL parameters: <https://duckduckgo.com/duckduckgo-help-pages/settings/params>
- MediaWiki search API: <https://www.mediawiki.org/wiki/API%3ASearch/en>
- Bing search result factors: <https://support.microsoft.com/en-us/bing/how-bing-delivers-search-results>
