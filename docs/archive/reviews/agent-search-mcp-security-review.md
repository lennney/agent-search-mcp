# Agent Search MCP — 安全评审报告

**评审视角**: 安全工程师  
**评审依据**: 2026-06-21-agent-search-mcp-final.md (计划) + agent-search-mcp-architecture-v2.mdx (架构)  
**评审日期**: 2026-06-22  
**项目阶段**: 设计阶段 (尚未实现)

---

## 总体风险评估

| 维度 | 风险评分(1-5) | 核心质疑 | 建议 |
|------|:------------:|----------|------|
| **爬虫法律风险** | ⚠️ **5 (严重)** | DDG/Sogou 均明确禁止自动化爬取。DDG ToS: "You may not use any robot, spider, scraper...without our express written permission"。Sogou 同样禁止非授权爬取。项目以 MIT 协议分发，但法律风险由部署者承担——MIT 不提供任何法律豁免。无官方 API 替代的 HTML 爬虫在 CFAA (美国)、GDPR (欧盟)、网络安全法/数据安全法 (中国) 下均有被追诉的可能。HiQ Labs v. LinkedIn 案中爬取公开数据被认为可能合法，但该判例范围有限、仍在上诉，且不适用于有明确 ToS 禁止的场景。 | **替换方案**: 放弃 HTML 爬虫，改用有合法 API 的免费源。替代方案: (a) [SearXNG](https://github.com/searxng/searxng) 自部署聚合搜索 (AGPL，需合规使用)；(b) 微软 Bing Web Search API (免费层 1000 次/月)；(c) Google Programmable Search (免费 100 次/天)。**法律合规**: 至少在每个免费引擎适配器文件头部放置法律警示注释，明确告知部署者须自行评估当地法律风险。 |
| **反爬对抗** | ⚠️ **5 (严重)** | 计划中仅提及 User-Agent 轮换和 3000ms timeout，远不足以对抗 DDG 和 Sogou 的反爬机制。DDG 使用: (1) 请求频率检测 + IP 级别速率限制，(2) CAPTCHA (在检测到自动化请求时弹出)，(3) Cookie/session 验证，(4) JavaScript 渲染依赖。Sogou 额外有: (5) 国内 IP 白名单偏好——非中国 IP 返回结果质量显著下降或直接拦截，(6) 百度式的反爬机制。3000ms timeout 对 DDG 往往不够——实测 DDG 搜索响应有时超过 5s。无 IP 池/代理池意味着单 IP 在 50-100 次请求后几乎必然被封。 | **建设性方案**: 将免费爬虫定位从"生产级搜索引擎"降级为"快速原型/个人实验用"。文档明确声明: (a) 免费引擎无 SLA，可能随时因反爬升级而失效；(b) 生产环境必须配置 Tavily/Brave 等付费 API。**技术加固可以做的**: 增加可配置的请求延迟 (jitter)、Cookie 持久化、请求头完整集 (Accept, Accept-Language, Referer)、可插入的代理池支持。但核心问题是——做得再好也不能解决法律问题。 |
| **API Key 安全** | 🟡 **2 (低-中)** | API key 存放方案: `config.yaml` + `process.env.AGENT_SEARCH_CONFIG` 环境变量覆盖。基于环境变量是行业标准做法，风险可控。但有三个具体缺口: (1) 代码中有 `config.yaml` 回退——如果用户不慎将 `config.yaml` 提交到 Git，API key 会泄露；(2) 无启动时 API key 校验——无效 key 只在第一次搜索时失败，体验差且浪费 quota；(3) 无 key 轮换/过期提醒机制；(4) 非加密存储——配置文件中明文存储，任何能读取文件系统的进程都能获取 key。 | 添加 `.gitignore` 默认忽略 `config.yaml`/`*.yaml` (除了 `config.default.yaml`)。添加启动时 key 校验: `if configured(key) { validateKeyFormat(key); }`。增加文档说明: 推荐使用环境变量 (`.env` / secrets manager) 而非配置文件。考虑增加 `validate` CLI 命令。 |
| **依赖安全** | 🟢 **1.5 (低)** | 仅 2 个运行时依赖 (`@modelcontextprotocol/sdk` + `zod`)，共 4 个 dev 依赖。攻击面较小，值得肯定。但 MCP SDK (`@modelcontextprotocol/sdk`) 是较新的项目 (v1.0.0 发布于 2024年底)，尚未经过广泛的安全审计。缺少: package-lock.json / yarn.lock 锁定依赖版本；无 `npm audit` / `snyk` 扫描 CI 步骤；无 Dependabot/Renovate 自动更新配置。 | 锁定依赖版本 (提交 lockfile)。在 CI 中增加 `npm audit`。配置 Dependabot 自动更新。在 README 中记录依赖风险: "SDK 尚在快速演进中，请关注上游安全公告"。 |
| **数据隐私** | ⚠️ **4 (高)** | 用户搜索查询被明文发送给 DDG (美国)、Sogou (中国，受《网络安全法》《数据安全法》管辖)、Tavily/Brave (第三方 API)。项目目前完全不涉及: (1) 隐私政策说明；(2) 数据日志/保留策略；(3) 用户知情同意；(4) PII (个人身份信息) 检测与过滤。Sogou 特别敏感——将用户查询发送给搜狗意味着受中国数据出境法规管辖。DDG 虽以隐私著称，但被爬时仍会记录请求 IP 和 User-Agent。**作为 MCP 工具，Agent 可能在用户不知情的情况下将私密查询 (如 "如何治疗 xxx 疾病"、"公司内部问题") 发给第三方搜索引擎。** | **必须做的事**: 在 README 和 capabilities resource 中添加明确的隐私声明，告知用户查询会被发送到哪些第三方搜索引擎。**强烈建议做**: 添加查询过滤 — 检测并警告可能包含 PII 的查询 (邮箱、电话号码、身份证号等) 并拒绝执行。添加 opt-out 机制让用户可以禁止特定引擎 (尤其是 Sogou)。考虑添加"查询日志本地模式"——禁用第三方引擎，只在本地做元搜索。GDPR/CCPA 合规: 在文档中说明部署者需自行完成数据保护影响评估 (DPIA)。 |
| **认证与授权** | ⚠️ **4 (高)** | 设计方案明确"无认证/授权机制"——这本身在 MCP stdio 模式下是合理的 (本地进程间通信)。但风险在于: (1) 如果通过 `--transport http` 或代理暴露到网络 (MCP 正在向 HTTP/SSE 发展)，将变成一个开放的公共搜索代理——任何人无需认证即可使用；(2) 无速率限制 — 单个 Agent 可无限调用，可能导致付费 API key 额度耗尽 (billing abuse)；(3) 无使用量审计日志；(4) 无最小权限原则 — Agent 一旦可调用 `free_search`，也可调用 `free_extract` 抓取任意 URL。 | 在文档中显式警告: "当前设计仅适用于本地 stdio MCP 模式。若暴露到网络，必须在前置添加认证代理 (如 API gateway / OAuth2 Proxy)。" 如果在意 billing 安全: 添加可选的每日配额限制 (`max_queries_per_day`) 到配置中。free_extract 需要额外注意: 建议添加 URL 验证 (拒绝内网 IP、file:// 协议)。 |
| **SSRF / 内容注入** | 🟡 **3 (中)** | `free_extract` 工具接收任意 URL 并抓取其内容。这引入了 Server-Side Request Forgery (SSRF) 风险: (1) Agent 可诱导提取内网地址 (如 `http://localhost:8080/`, `http://10.0.0.1/admin`)，可能在开发者本地泄露内部服务信息；(2) `file://` 协议可能被利用读取本地文件；(3) 3xx 重定向未提及处理——可能被重定向到恶意站点。内容以 markdown 格式返回——如果 Agent 后续渲染/展示内容，可能引入 XSS 风险 (取决于 Agent 端如何消费)。 | **必须做**: URL 验证黑名单 — 拒绝私有 IP 范围 (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, ::1)，拒绝 `file://`, `data://`, `ftp://` 协议。推荐限制只允许 HTTP/HTTPS。添加重定向跟随限制 (最多 5 跳) 并验证最终 URL。**建议做**: 设置请求头 `User-Agent` 为项目标识 (而非浏览器 UA)，以便目标网站识别。添加 `max_length` 上限 (已有5000字符，好)。 |
| **配置安全** | 🟡 **2 (低-中)** | 配置加载逻辑: `process.env.AGENT_SEARCH_CONFIG \|\| 'config.yaml'`。问题: (1) `config.yaml` 默认与 CWD 相对路径——用户可能从任意目录启动，意外加载恶意配置；(2) YAML 解析可能引入 `!!python/object` 等标签导致任意代码执行 (取决于使用什么 YAML 库——如果使用 `js-yaml` 且未禁用 `safeLoad`，有原型链污染风险)；(3) 无配置 schema 强校验——类型错误可能在运行时才暴露。 | 指定 `config.yaml` 为项目根目录路径。使用 `js-yaml` 的 `safeLoad` (禁用 schema 标签解析)。添加 JSON Schema 对配置文件做运行时校验。明确 `config.yaml` 的文件权限要求 (`chmod 600` 含 API key 的文件)。 |
| **日志安全** | 🟡 **2 (低-中)** | 代码中使用了 `console.error` 记录 provider 失败。无结构化日志、无日志级别、无敏感信息过滤。如果一个 provider 返回错误中包含 API key 或查询参数，可能被记录到 stdout/stderr。 | 添加结构化日志 (可用 `pino` 或 `consola`)。添加日志级别 (`debug`/`info`/`warn`/`error`)。实现敏感信息过滤器，防止 API key 和 PII 出现在日志中。 |

---

## 风险矩阵摘要

```
严重 (5) ─── 爬虫法律风险  ·  反爬对抗  
 高  (4) ─── 数据隐私  ·  认证/授权  
 中  (3) ─── SSRF / 内容注入  
 低  (2) ─── API Key 安全  ·  配置安全  ·  日志安全  
很低 (1) ─── 依赖安全  
```

**整体风险评级: 🔴 高 (Critical flaws in legal and anti-bot dimensions)**

---

## 核心结论

### 不能接受的 (必须解决)

1. **爬虫法律风险 (5/5)**: 这是否决性风险。在 2026 年的法律环境下，未经授权爬取 DDG 和 Sogou 并打包成 MCP 工具供 Agent 使用，在法律上处于灰色甚至红色地带。MIT 协议不提供任何庇护。**建议放弃纯 HTML 爬虫方案**，改用 SearXNG 自部署或 Bing/Google 的免费 API。

2. **反爬对抗 (5/5)**: 即使忽略法律问题，纯 User-Agent 轮换 + 3000ms timeout 的方案在 DDG 和 Sogou 面前在一周内就会失效。项目将频繁遭遇 CAPTCHA 和 IP 封禁，用户体验极差。用户最终只能依赖付费 API (Tavily/Brave)——既然如此，为什么不直接只做付费 API 的 MCP 封装？

3. **数据隐私 (4/5)**: 将用户查询路由到搜狗 (Sogou) 而不做明确的隐私告知和 opt-out，在欧盟 GDPR 和中国数据安全法下都有合规风险。特别是 Sogou 的数据流向中国，可能触发数据出境监管。

### 建议做的事 (高优先级)

4. **free_extract SSRF 防护**: 这是一个 MCP 工具的标准风险——必须添加 URL 黑名单验证。
5. **隐私声明**: 在 README 和 MCP capabilities resource 中明确告知用户数据流向。

### 可以接受/已做得不错

6. 仅 2 个运行时依赖，攻击面小 👍
7. 使用环境变量 + 配置文件管理 API key，标准做法
8. 渐进式披露 (Exa 模式) 的设计本身没有安全问题
9. Top-1 snippet、截断、去重等聚合逻辑不引入额外安全风险

---

## 修改建议清单 (按优先级)

```
P0 ─── 法律: 重新评估 HTML 爬虫方案的法律可行性
P0 ─── 法律: 至少增加法律警示注释在所有免费引擎适配器中
P1 ─── 隐私: 添加隐私声明 + 查询流向告知 + Sogou opt-out
P1 ─── SSRF: free_extract 添加 URL 黑名单验证
P1 ─── 文档: 明确声明免费引擎无 SLA、生产需付费 API
P2 ─── 安全: 添加 .gitignore 忽略 config.yaml
P2 ─── 安全: 添加启动时 API key 校验
P2 ─── 安全: 添加可选配额限制
P3 ─── 依赖: 添加 lockfile + npm audit CI
P3 ─── 配置: js-yaml safeLoad + schema 校验
P3 ─── 日志: 敏感信息过滤
```

---

*评审结束。如需进一步讨论某条风险的缓解方案或替代架构，请告知。*
