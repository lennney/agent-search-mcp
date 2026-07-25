# 不只是搜索 API：我给 AI Agent 做了一个搜索路由器

> `npx agent-search-mcp`：零密钥起步，中文原生路由，多源证据可检查，按 token 预算渐进搜索，必要时再升级商业 API。

很多 AI Agent 的搜索接入都从“注册账号、创建 API Key、绑定额度”开始。但 Agent 真正缺的不只是一个能返回链接的 API，而是一个搜索控制层：去哪里搜、什么时候停、花多少上下文、哪些证据值得信。

所以这个项目选的不是“再做一个 Tavily/Exa”，而是一条不同的路线：

- 不注册账号也能开始搜索；
- 能直接覆盖搜狗、百度等中文来源；
- 一个 MCP Server 里做多源聚合、去重、排序和自动降级；
- 需要更强商业搜索时，再选择性接入 Brave、Tavily、Exa 或 You.com。

于是有了开源项目 [agent-search-mcp](https://github.com/lennney/agent-search-mcp)。

## 一分钟接入

项目要求 Node.js 18 或更高版本。

```json
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["-y", "agent-search-mcp"]
    }
  }
}
```

不需要预先全局安装，也不需要 API Key。保存配置、重启 MCP 客户端即可。

项目还提供 CLI：

```bash
fasm search "MCP Server 中文搜索"
fasm extract "https://example.com"
```

## 它和 Tavily、Exa、Brave 的关系

这不是“谁替代谁”的关系，而是不同产品边界：

| 方案 | 主要优势 | 更适合 |
|------|----------|--------|
| Agent Search MCP | 本地、零密钥起步、中文引擎、多源聚合 | 本地 Agent、中文检索、开源自托管 |
| Tavily MCP | 托管 Search/Extract/Map/Crawl | 需要完整托管采集工作流 |
| Exa MCP | 语义、代码、企业研究 | 高相关语义检索和研究任务 |
| Brave Search MCP | 独立索引、新闻/图片/视频等垂直搜索 | 需要稳定商业索引和垂直结果 |

商业服务通常提供免费额度，但仍需要账号或凭证。价格和额度会变化，所以项目不再用容易过期的“每月省多少钱”作为卖点。

## 当前搜索架构

包内有 12 个搜索适配器，其中 8 个不需要凭证，4 个为可选商业 API。

当前 `free_search`、`free_search_advanced`、CLI 和瀑布模式已统一路由全部 12 个适配器：

- DuckDuckGo
- 搜狗
- Bing
- 百度
- Wikipedia
- Startpage
- Yandex
- Mojeek
- Brave（可选 Key）
- Tavily（可选 Key）
- Exa（可选 Key）
- You.com（可选 Key）

一次搜索会经过：

```text
查询
  → 语言识别与引擎选择
  → 并行或瀑布编排
  → URL/标题去重
  → 排序与安全标记
  → normal / compact 输出
```

如果 Python `ddgs` 不可用，DuckDuckGo 会自动回退到纯 Node.js HTML 路径。这个回退刚补上了主编排层的回归测试。

## 为 Agent 控制上下文体积

搜索工具很容易把大量摘要和元数据塞进上下文。项目提供几组可选配置：

```bash
OUTPUT_STYLE=compact
MAX_FULL_RESULTS=3
SNIPPET_LENGTH=160
MIN_CONFIDENCE=0
```

Compact 模式会完整展示前几个结果，其余结果只保留标题和 URL；Agent 需要时再调用 `free_extract`。历史 30 查询真实运行实测 Compact 节省 28.7% token、Compact+ 节省 35.5%，瀑布调用数相比 8 引擎全并发少 75%。这些是当时查询集和环境的实测，不是生产保证。新的冻结 fixture + 锁定 tokenizer 回放可稳定验证 30.2% / 33.9% 的格式化节省。

## 可靠性和安全边界

当前版本包含：

- stdio 与 Streamable HTTP，HTTP 默认要求 Bearer Token 并校验浏览器 Origin；
- MCP read-only / idempotent annotations；
- 引擎限速、健康状态与熔断；
- URL 安全检查和搜索内容注入标记；
- 510 项 Vitest 测试；
- Linux、macOS、Windows 通用构建脚本。

最近还修复了两个容易被忽略的问题：

1. 熔断日志从 stdout 移到 stderr，避免污染 stdio JSON-RPC；
2. CSDN 抓取只允许 `https://blog.csdn.net`，并拒绝重定向，封住直接 SSRF 入口。

## 适合与不适合

适合：

- 想让本地 Agent 先获得无需账号的网页搜索；
- 经常搜索中文技术资料；
- 希望保留自托管和多上游选择权；
- 愿意用开源项目换取更低的接入门槛。

不适合：

- 需要企业 SLA、稳定高并发和统一托管；
- 需要站点 Crawl/Map、浏览器交互或图片/视频垂直搜索；
- 要求搜索质量由人工标注 benchmark 或商业合同保证。

## 接下来

下一阶段会优先做三件事：

1. 给真实搜索 benchmark 增加人工相关性标签和稳定的网络 runner；
2. 为 HTTP 部署补充反向代理、密钥轮换和部署指南；
3. 继续用真实失败查询校准 relevance、confidence 和 `source_count`。

项目地址：[github.com/lennney/agent-search-mcp](https://github.com/lennney/agent-search-mcp)

如果你正在用 Claude Code、Cursor 或 Codex，欢迎试一下；Issue、测试样例和失败查询，比一句“好用”更有帮助。
