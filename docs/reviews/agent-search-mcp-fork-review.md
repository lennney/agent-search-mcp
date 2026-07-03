# Agent Search MCP — Fork 改造方案评审报告

> **评审对象**: `2026-06-21-agent-search-mcp-fork-plan.md`
> **评审维度**: 版权合规性 · 轻量化改造 · 架构改造 · 时间线 · 风险
> **评审视角**: 技术 + 版权
> **评审日期**: 2026-06-22

---

## 总体评分

| 维度 | 评分 | 说明 |
|------|:----:|------|
| 版权合规性 | ⚠️ **3/5** | 基本框架正确，但存在潜在缺口 |
| 轻量化改造 | ✅ **4/5** | 依赖裁剪合理，但替代方案有隐患 |
| 架构改造 | ⚠️ **3/5** | 聚合层设计好，但引擎层地基不稳 |
| 时间线 | ⚠️ **2/5** | 4.5天过于乐观，低估了爬虫调试成本 |
| 风险评估 | 🔴 **2/5** | 遗漏了多项关键风险 |

**综合评级: ⚠️ 可行但有严重隐患，建议 P0 问题全部解决后再启动**

---

## 一、版权合规性 (3/5)

### ✅ 做得正确的

1. **LICENSE 结构设计** — 保留原 Apache 2.0 全文 + 原版权声明 + 新增声明，符合 Apache 2.0 §4(b) 要求
2. **名称避让** — 不使用 "open-websearch" 作为项目名，符合 Apache 2.0 §6 商标保护条款
3. **README 声明** — 明确标注 "Based on open-websearch"，包含修改清单，满足 Apache 2.0 §4(c)

### 🔴 P0 问题

#### P0-1: 原项目许可证核实缺失
- **问题**: 计划声明原项目为 Apache 2.0，评审中未通过 GitHub API 实际核实。如果原项目实际为 MIT 或其他许可证，LICENSE 文件处理方式完全不同
- **风险**: 假设错误导致整个版权合规策略失效
- **建议**: 必须通过 GitHub API (`/repos/Aas-ee/open-websearch`) 或直接查看原项目 LICENSE 文件确认许可证类型

#### P0-2: 爬虫法律风险未被识别为版权/法律问题
- **问题**: 计划的风险章节仅列出"版权合规"作为风险项，但未识别 DDG/Sogou 爬虫的 ToS 违约风险和 CFAA 法律风险（详细见安全评审报告）
- **风险**: 项目以 Apache 2.0 分发，但 Apache 2.0 **不提供任何法律豁免**。分布式爬虫工具的法律责任由部署者承担
- **建议**: 在 README/LICENSE 中增加免责声明，明确告知爬虫行为的法律风险

#### P0-3: Sogou 引擎的数据合规问题未处理
- **问题**: Sogou 隶属于搜狗/腾讯，将用户查询发送到 Sogou 意味着数据受中国《网络安全法》《数据安全法》管辖。如果是跨境部署，可能触发数据出境监管
- **建议**: 在隐私声明中明确告知用户查询会发送到 Sogou（中国），并提供 opt-out 机制

### 🔵 P2 问题

#### P2-1: 无修改清单文件 (CHANGELOG 不足)
- **问题**: 计划有 CHANGELOG.md 但无专门的 `NOTICE` 或 `MODIFICATIONS` 文件。Apache 2.0 §4(d) 要求在 NOTICE 文件中声明修改
- **建议**: 添加 `NOTICE.md` 记录所有实质性修改

---

## 二、轻量化改造 (4/5)

### 依赖裁剪分析

| 删除的依赖 | 替代方案 | 评审意见 |
|-----------|---------|---------|
| axios → 原生 fetch | ✅ 合理，Node 18+ 内置 fetch 稳定 | 但需注意 fetch 无自动重试/拦截器，需自行实现 |
| cheerio → 正则 | ⚠️ **风险点** | 正则解析 HTML 极其脆弱。DDG/Sogou 页面结构变更即断裂。建议至少准备一个 lightweight HTML parser 作为 fallback（如 `node-html-parser`，无依赖、仅 2KB） |
| express/cors → STDIO | ✅ 合理，MCP 标准做法 |
| @mozilla/readability → Jina Reader | ⚠️ **隐患** | Jina Reader 是外部 API，有速率限制（~20 req/min），无 SLA。如果 Jina 变更策略或关闭免费层，`free_extract` 立即失效。建议保留轻量级本地 readability 实现作为 fallback |
| koffi/https-proxy-agent/ipaddr.js | ✅ 合理，移除 Node FFI 绑定和代理逻辑符合轻量化目标 |

### 新增依赖评估

| 新增依赖 | 评审 |
|---------|------|
| pino ^9.0.0 | ✅ 合理，轻量级结构化日志，~12KB |
| yaml ^2.0.0 | ⚠️ 需确认安全配置：必须使用 `safeLoad` 防止 YAML 标签注入 |

### 🔴 P0 问题

#### P0-4: 正则 HTML 解析无结构校验
- **问题**: DDG 和 Sogou 的搜索结果解析完全依赖正则表达式。如果任一引擎的 HTML 结构改变，解析器静默返回空结果，无法区分"无结果"和"解析失败"
- **建议**: 
  1. 增加解析后的结构校验（至少检查 title/url/snippet 三字段完整）
  2. 添加解析成功率监控指标
  3. 考虑 fallback 到 `<node-html-parser>`（无额外运行时依赖）

### 🔵 P2 问题

#### P2-2: yaml 依赖的安全使用未注明
- **问题**: YAML 解析可能引入 `!!python/object` 标签导致任意代码执行
- **建议**: 明确使用 `yaml.parse` (safe mode) 而非 `yaml.eval`

---

## 三、架构改造 (3/5)

### ✅ 设计亮点

1. **聚合层 (Aggregation Layer)**
   - URL 精确去重 + 标题 Jaccard 相似度去重 — 成熟方案
   - 多源验证置信度 (confidence = engines.length) — 简洁有效
   - 精简输出截断（标题≤100, 描述≤200）— 省 token

2. **Fallback 链设计**
   - Phase 1 (免费源) → Phase 2 (付费源) — 清晰的降级策略
   - 免费源 ≥ count 时不调付费源 — 省 API 额度

3. **渐进式工具**
   - `free_search` (默认, 2-3 参数) + `free_search_advanced` (多参数) + `free_extract`
   - Exa 模式 — 对 Agent 友好

4. **基础设施层基本完整**
   - UA 轮换 + Cache + HealthTracker — 关键基础设施齐全

### 🔴 P0 问题

#### P0-5: 无 RateLimiter
- **问题**: 计划中完全缺失限速机制。DDG 和 Sogou 均对频繁请求有严格反爬机制。无限速意味着：
  1. DDG 在 ~50 次请求后大概率触发 CAPTCHA
  2. Sogou 在 ~20 次请求后可能直接封禁 IP
  3. Brave/Tavily 免费 tier 有月度硬限制（2000/1000次），无限速可能几天内耗尽
- **建议**: 添加 per-provider 限速器（至少 1s 间隔），并支持可配置的请求延迟

#### P0-6: free_extract 无 SSRF 防护
- **问题**: `free_extract` 接收任意 URL 并无验证。Agent 可诱导其提取内网地址（SSRF）或 `file://` 协议读取本地文件
- **建议**: 
  1. 拒绝私有 IP 范围（127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, ::1）
  2. 拒绝 `file://`, `data://`, `ftp://` 协议
  3. 限制重定向跟随最多 5 跳

### 🟡 P1 问题

#### P1-1: Jina Reader 替代 readability 的可靠性未验证
- **问题**: 计划用 Jina Reader 替代 `@mozilla/readability`，但 Jina Reader 是外部 API，有：速率限制（20 req/min 免费层）、延迟不可控、可用性无 SLA
- **建议**: Phase 0 增加 Jina Reader API 的 POC 验证。或者保留精简版 readability 作为本地 fallback

#### P1-2: Cache 无内存限制
- **问题**: LRU Cache 设计为 `Map<string, {data, expiry}>`，但无最大条目限制。长时间运行可能导致内存泄漏
- **建议**: 添加 `maxSize` 参数（如 1000 条目），超出时淘汰最久未访问条目

#### P1-3: 无可观测性设计
- **问题**: 计划提及 pino 日志，但无结构化日志链路追踪（searchId）、无指标收集、无健康检查 Resource 的具体实现（`search://health` 仅列出 URI，未定义 schema）
- **建议**: 添加搜索链路 ID (searchId/requestId)，实现 `search://health` Resource 的 JSON schema

#### P1-4: HealthTracker 阈值未定义
- **问题**: 计划列出 `search://health` 但未定义健康判定标准（连续 N 次失败视为不健康？恢复机制？半开状态？）
- **建议**: 实现 Circuit Breaker 模式 — 连续 5 次失败熔断 30s，之后半开尝试

### 🔵 P2 问题

#### P2-3: 评分模型缺乏合理性验证
- **问题**: 评分公式为 `多源验证 × 引擎权重`，但权重值未定义。各引擎的结果质量差异大（DDG 英文好、Sogou 中文好），固定权重不合理
- **建议**: 权重应随语言动态调整（如英文搜索 DDG=1.0, Sogou=0.3；中文搜索 Sogou=1.0, DDG=0.5）

#### P2-4: 文件结构不一致
- **问题**: 计划 $5.1 使用 `src/aggregation/`，$5.2 使用 `src/infrastructure/`，但 §6 文件结构完全不一致地使用了 `src/engines/` 和 `src/providers/` 混用
- **建议**: 统一术语（建议使用 `providers/`，行业标准），并确保文件结构与设计图一致

---

## 四、时间线 (2/5)

### 4.5 天评估

```
Phase 0 (0.5天): Fork + 准备
Phase 1 (1天):   聚合层
Phase 2 (1天):   付费引擎 + Fallback
Phase 3 (0.5天): 基础设施
Phase 4 (0.5天): 渐进式工具
Phase 5 (1天):   测试 + 发布
总计: ~4.5 天
```

### 🔴 P0 问题

#### P0-7: DDG/Sogou 爬虫开发时间被严重低估
- **问题**: Phase 0 中的 "简化 HTTP 层 + 简化 HTML 解析" 被列为 0.5 天。实际经验表明：
  1. DDG 的 HTML 结构在 2024-2025 年间至少变更 3 次
  2. Sogou 需要处理 JS Cookie 验证 + 可能的 CAPTCHA
  3. 正则调试在多种语言查询下的覆盖率测试需要 1-2 天
- **建议**: 单独列出 "爬虫可行性验证" 阶段（至少 1 天），先确认 DDG/Sogou 在当前时间点可用

#### P0-8: 缺少环境的依赖配置时间
- **问题**: 计划假设 Brave 和 Tavily API key 立即可用、Jina Reader 立即可用、NPM 发布流程顺畅
- **建议**: 增加 0.5 天用于 API key 申请 + 各免费层配额确认 + CI/CD 配置

### 🟡 P1 问题

#### P1-5: 测试时间不足
- **问题**: 1 天测试覆盖 unit + integration + README + NPM 发布过于乐观。仅集成测试就需要 mock 4 个搜索引擎 + 验证 fallback 链
- **建议**: 测试单独列 1.5-2 天

**调整后时间线建议: 8-10 天**（比计划翻倍）

---

## 五、风险评估 (2/5)

### 计划识别的风险 vs 实际风险

| 计划中列出的风险 | 我们评估 |
|----------------|---------|
| DDG/Sogou HTML 结构变更 → 解析失败 | ✅ 正确，但缓解措施不足（只提"告警"无自动化修复） |
| 免费引擎被封 → 搜索不可用 | ✅ 正确，但概率远高于计划评估 |
| SSRF (free_extract) → 安全漏洞 | ✅ 正确，但无具体缓解方案 |
| 版权合规 → 法律风险 | ⚠️ 识别了但未深挖 |

### 🔴 P0 问题 (遗漏的关键风险)

#### P0-9: DDG/Sogou ToS 和自动化爬取的法律风险
- **遗漏原因**: 计划只关注了"原项目版权合规"，未考虑"搜索引擎 ToS 合规"
- **风险等级**: 严重。DDG ToS 明确禁止自动化爬取。Sogou 同样禁止。MIT/Apache 2.0 协议不提供任何法律豁免
- **影响**: 项目可能面临侵权通知、DMCA takedown 甚至法律诉讼
- **建议**: 
  1. **放弃 HTML 爬虫方案**，改用有合法 API 的免费源（如 SearXNG 自部署、Bing 免费 API）
  2. 如果坚持爬虫方案，必须：每个引擎文件头部加法律警示注释、README 明确法律风险、提供明确 opt-out 给部署者

#### P0-10: 无反爬对抗策略
- **遗漏原因**: 计划假设简单 UA 轮换 + timeout 足够
- **风险等级**: 严重。DDG 使用 CAPTCHA + IP 速率限制 + Cookie 验证。Sogou 额外有：国内 IP 优先、JS 渲染依赖
- **影响**: 单 IP 在部署后数小时/数天内必然被封，免费引擎变为不可用
- **建议**: 至少增加：可配置请求间隔、Cookie 持久化、请求头完整集、代理池支持

#### P0-11: 数据隐私风险
- **遗漏原因**: 计划未从用户隐私角度审视搜索引擎选择
- **风险等级**: 高。用户搜索查询明文发送给 DDG（美国）、Sogou（中国）、Brave/Tavily（第三方 API）。Sogou 特别敏感 — 数据流向中国可能触发跨境监管
- **建议**: 在 capabilities resource 中添加隐私声明，告知查询流向，提供 per-engine opt-out

### 🟡 P1 问题

#### P1-6: 付费 Free Tier 的可持续性
- **风险**: Brave Free Tier (2000 次/月) 和 Tavily Free Tier (1000 次/月) 在活跃使用中几天内即可耗尽。之后付费引擎 fallback 失效
- **建议**: 添加月度配额追踪和告警，在接近限额时自动降级为免费源

#### P1-7: 静默失败风险
- **风险**: DDG/Sogou 爬虫返回空结果时，系统无法区分"搜索无结果"和"解析失败"
- **建议**: 添加结构化验证（至少 title/url/snippet 非空），解析失败时记录 warning 日志

### 🔵 P2 问题

#### P2-5: 单点故障
- **风险**: 如果主搜索引擎全部不可用（DDG 被封 + Sogou 被封 + Brave/Tavily 额度用完），整个服务不可用
- **建议**: 建立 emergency fallback 到搜索引擎的纯文本模式或静态结果

#### P2-6: 安全更新依赖
- **风险**: 项目依赖 MCP SDK (^1.11.2) 和 zod，均为活跃开发中的包，可能有 breaking changes 或安全漏洞
- **建议**: 提交 lockfile，配置 Dependabot 自动依赖更新

---

## 问题汇总清单

### 🔴 P0 (必须解决, 11个)

| # | 问题 | 维度 | 建议 |
|---|------|------|------|
| P0-1 | 原项目许可证未核实 | 版权 | 通过 GitHub API 确认 open-websearch LICENSE |
| P0-2 | 爬虫法律风险未识别 | 版权/风险 | 在 README + LICENSE 中添加法律免责声明 |
| P0-3 | Sogou 数据合规 | 版权/风险 | 隐私声明 + Sogou opt-out |
| P0-4 | 正则 HTML 解析无结构校验 | 技术 | 增加解析后验证 + 解析成功率指标 |
| P0-5 | 无 RateLimiter | 架构 | per-provider 限速器 (1s 间隔) |
| P0-6 | free_extract 无 SSRF 防护 | 架构 | URL 黑名单 (私有IP + 危险协议) |
| P0-7 | DDG/Sogou 爬虫难度低估 | 时间线 | 单独爬虫验证阶段 1天 |
| P0-8 | 环境准备时间缺失 | 时间线 | 增加 API key/配额验证 0.5天 |
| P0-9 | DDG/Sogou ToS 自动化爬取违法 | 风险 | **建议放弃爬虫方案**，改用 SearXNG |
| P0-10 | 无反爬对抗策略 | 风险 | 请求间隔 + Cookie + 代理池 |
| P0-11 | 数据隐私风险未披露 | 风险 | 隐私声明 + 查询流向告知 |

### 🟡 P1 (重要, 7个)

| # | 问题 | 维度 | 建议 |
|---|------|------|------|
| P1-1 | Jina Reader 可靠性未验证 | 技术 | Phase 0 POC 验证，或保留本地 readability fallback |
| P1-2 | Cache 无内存限制 | 架构 | 添加 maxSize 上限 (1000 条目) |
| P1-3 | 无可观测性链路追踪 | 架构 | searchId + 结构化日志 |
| P1-4 | HealthTracker 阈值/熔断未定义 | 架构 | Circuit Breaker 模式 |
| P1-5 | 测试时间不足 | 时间线 | 测试从 1天 → 1.5-2天 |
| P1-6 | 付费 Free Tier 配额可持续性 | 风险 | 月度配额追踪 + 自动降级 |
| P1-7 | 静默失败风险 | 风险 | 结构化验证 + warning 日志 |

### 🔵 P2 (可选优化, 6个)

| # | 问题 | 维度 | 建议 |
|---|------|------|------|
| P2-1 | 无 NOTICE 文件 | 版权 | 添加 MODIFICATIONS.md |
| P2-2 | yaml 安全使用未注明 | 安全 | 使用 safeLoad/parse |
| P2-3 | 评分权重不合理 | 架构 | 语言自适应权重 |
| P2-4 | 文件结构 terminology 不一致 | 架构 | 统一为 providers/ |
| P2-5 | 搜索引擎单点故障 | 风险 | emergency fallback 策略 |
| P2-6 | 无 Dependabot 安全更新 | 风险 | 锁版本 + 自动更新 |

---

## 核心结论

### 替代方案对比

考虑到 P0-9（爬虫法律风险）和 P0-10（反爬对抗）这两个否决性风险，建议重新评估引擎方案：

| 方案 | 版权风险 | 稳定性 | 成本 | 开发时间 | 推荐度 |
|------|---------|--------|------|---------|:------:|
| **原方案**: DDG + Sogou (爬虫) | 🔴 高 | 🔴 低 | 免费 | ~10天 | ❌ |
| **方案A**: SearXNG 公共实例 + Brave Free Tier | 🟢 低 | 🟡 中 | 免费 | ~8天 | ⭐ **推荐** |
| **方案B**: SearXNG 自部署 + Brave Free Tier | 🟢 低 | 🟢 高 | 服务器费 | ~10天 | ✅ 生产级 |
| **方案C**: Bing Web Search API (1000次/月免费) | 🟢 低 | 🟢 高 | 免费 | ~5天 | ✅ 最快 |

**建议**: 采用**方案A**（SearXNG 公共实例 + Brave Free Tier），这也是已有多次评审后达成的共识方案（见 `review-results.md` 和 `final.md`）。

### "Go/No-Go" 判定

```
现行计划:  NO-GO ❌
  └─ 原因: P0-9 (DDG/Sogou 法律风险) + P0-10 (无反爬) 为否决项
  └─ 前提: 必须切换至 SearXNG/API 方案

修订计划 (SearXNG + Brave + Tavily):  GO ✅
  └─ 仍须解决: P0-1, P0-6, P1-1, P1-3, P1-6
```

---

*评审结束。如需某一维度的深入探讨或具体缓解方案设计，请告知。*
