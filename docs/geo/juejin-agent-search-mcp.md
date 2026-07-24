# 不想先注册搜索 API？我做了一个零密钥起步的 MCP 搜索服务器

> `npx agent-search-mcp`，让 Claude Code、Cursor、Codex 等 MCP 客户端直接获得网页搜索、中文搜索、新闻和正文提取能力。

很多 AI Agent 的搜索接入都从“注册账号、创建 API Key、绑定额度”开始。商业搜索服务在托管、深度研究和 Crawl/Map 上很强，但对于本地开发、中文资料检索和低门槛试用，我想要另一种选择：

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

当前 `free_search` 和 CLI 已统一路由：

- DuckDuckGo
- 搜狗
- Bing
- 百度
- Brave（可选 Key）
- Tavily（可选 Key）
- Exa（可选 Key）
- You.com（可选 Key）

Wikipedia、Startpage、Yandex、Mojeek 适配器已经在包内，但还没有在所有 MCP/CLI 入口统一开放。README 会明确区分“已有适配器”和“当前可选择路由”，避免把代码数量包装成用户能力。

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

Compact 模式会完整展示前几个结果，其余结果只保留标题和 URL；Agent 需要时再调用 `free_extract`。这是可配置的产品能力，但当前 benchmark 仍是探索性基线，项目暂不把历史 token 百分比当成生产保证。

## 可靠性和安全边界

当前版本包含：

- stdio 与 Streamable HTTP；
- MCP read-only / idempotent annotations；
- 引擎限速、健康状态与熔断；
- URL 安全检查和搜索内容注入标记；
- 498 项 Vitest 测试；
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

1. 统一 12 个适配器在 MCP、CLI 和瀑布模式中的可达性；
2. 重做 benchmark 遥测，让引擎调用数、停止阶段和 token 统计可复现；
3. 修正 confidence 与“来源数量”的契约，避免把相关度分数写成验证次数。

项目地址：[github.com/lennney/agent-search-mcp](https://github.com/lennney/agent-search-mcp)

如果你正在用 Claude Code、Cursor 或 Codex，欢迎试一下；Issue、测试样例和失败查询，比一句“好用”更有帮助。
