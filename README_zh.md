# Agent Search MCP

> **12 个搜索引擎（8 个免费，无需 API Key），一个 MCP Server。**
> 搜狗 + 百度原生中文搜索。多源交叉验证 + 置信度评分。瀑布式渐进搜索。内容提取。`npx agent-search-mcp` 即可使用。

[![npm version](https://img.shields.io/npm/v/agent-search-mcp)](https://www.npmjs.com/package/agent-search-mcp)
[![npm downloads](https://img.shields.io/npm/dm/agent-search-mcp)](https://www.npmjs.com/package/agent-search-mcp)
[![GitHub stars](https://img.shields.io/github/stars/lennney/agent-search-mcp)](https://github.com/lennney/agent-search-mcp/stargazers)
[![CI](https://github.com/lennney/agent-search-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/lennney/agent-search-mcp/actions)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Glama](https://glama.ai/mcp/servers/lennney/agent-search-mcp/badges/score.svg)](https://glama.ai/mcp/servers/lennney/agent-search-mcp)

[English](README.md) · [Benchmarks](./benchmarks/) · [CHANGELOG](./CHANGELOG.md)

---

## 为什么选择 Agent Search MCP

大多数 MCP 搜索服务器只是封装单个付费 API — 一个引擎，一张账单。Agent Search MCP 架构完全不同。

| | Agent Search MCP | Tavily | Exa | Brave |
|---|:---:|:---:|:---:|:---:|
| **价格** | **$0** | ~$30/月 | $50/月 | ~$15/月 |
| **免费引擎数** | **8** | 0 | 0 | 1（2K/月封顶） |
| **需要 API Key** | 不需要 | 需要 | 需要 | 需要 |
| **多源验证** | ✅ 8 引擎交叉验证 | ❌ | ❌ | ❌ |
| **中文搜索** | ✅ 搜狗+百度 | ❌ | ❌ | ❌ |
| **自托管** | ✅ | ❌ | ❌ | ❌ |

### 完全免费

8 个引擎零配置即可使用 — DuckDuckGo、搜狗、Bing、百度、Wikipedia、Startpage、Yandex、Mojeek。无需 API Key，无需注册，无需信用卡。按每天 100 次搜索算，比付费方案省 $30–50/月。

### 减少 75% 引擎调用

基于 [30 条多样化查询](./benchmarks/)（15 条英文 + 15 条中文）的基准测试：**100% 在瀑布阶段一即满足要求**，仅需 2 个引擎。简单多引擎搜索每次都调全部 8 个引擎。瀑布式搜索在置信度足够时提前停止 — 更少调用、更低延迟、更少数据喂给 LLM。

### 多源交叉验证

DDG 和搜狗返回**零重叠结果集** — 覆盖面真正比单一引擎更广。每个结果经多源比对后给出 1–3 分置信度评分。置信度 ≥2 的结果经过至少 2 个引擎交叉验证。

### Token 省在架构里

两层节省机制，基于 30 条 EN+ZH 查询的基准测试：
- **瀑布提前停止** → 调 2 个而非 8 个引擎 → **减少 75% 引擎调用**
- **Compact 模式** → 去除元数据噪声 + 渐进式披露 → **减少 28.7% token**（1582 → 1128）
- **Compact Aggressive**（`SNIPPET_LENGTH=120`）→ **减少 35.5% token**（1582 → 1020）

### 原生中文搜索

搜狗 + 百度直接搜索中文互联网 — 微信公众号内容、百度百科、中文技术论坛。不是翻译层，不是附属功能。

---

## 快速开始

```bash
# 一条命令 — 无需安装，无需 API Key
npx agent-search-mcp
```

需要 Node.js >= 18。

### 客户端配置

<details>
<summary><b>Claude Code / Claude Desktop</b></summary>

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
</details>

<details>
<summary><b>Cursor / VS Code / Codex</b></summary>

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
</details>

<details>
<summary><b>Windsurf</b></summary>

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
</details>

<details>
<summary><b>Hermes</b></summary>

```yaml
mcp_servers:
  agent-search:
    command: npx
    args: ["-y", "agent-search-mcp"]
```
</details>

---

## 搜索引擎

| 引擎 | 免费 | 优势 |
|------|:----:|------|
| **DuckDuckGo** | ✅ | 隐私保护，英文搜索 |
| **搜狗** | ✅ | 中文网页搜索，微信公众号内容 |
| **Bing** | ✅ | 多语言，英文结果好 |
| **百度** | ✅ | 中文网页搜索，百度百科 |
| **Wikipedia** | ✅ | 结构化知识，JSON API |
| **Startpage** | ✅ | Google 结果通过隐私代理 |
| **Yandex** | ✅ | 俄语/西里尔语搜索 |
| **Mojeek** | ✅ | 独立爬虫，隐私优先 |
| Brave Search | ❌ | 高质量网页搜索（2K 免费/月） |
| Tavily | ❌ | Agent 优化搜索（1K 免费/月） |
| Exa | ❌ | 神经语义搜索（1K 免费/月） |
| You.com | ❌ | AI 驱动搜索（$5/千次，有免费额度） |

---

## 工具

| 工具 | 说明 | 适用场景 |
|------|------|----------|
| `free_search` | 多引擎搜索 + 自动回退 | 快速查事实 |
| `free_search_advanced` | 过滤搜索 + 瀑布流程 + 内容丰富化 | 高置信度结果、时间过滤 |
| `free_search_news` | DDG 新闻 + Bing 新闻 | 时事新闻 |
| `search_with_synthesis` | 深度搜索 + LLM 综合提示 | 复杂查询需多源验证 |
| `free_extract` | 提取完整页面为 Markdown | 阅读搜索结果中的页面 |
| `fetch_github_readme` | 获取 GitHub 仓库 README | 项目文档查阅 |
| `fetch_csdn_article` | 获取 CSDN 文章内容 | 中文开发者文章 |
| `fetch_juejin_article` | 获取掘金文章内容 | 中文开发者文章 |

所有工具均为只读、幂等，带 MCP 2025 注解。

---

## 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BRAVE_API_KEY` | — | Brave Search API Key |
| `TAVILY_API_KEY` | — | Tavily API Key |
| `EXA_API_KEY` | — | Exa API Key |
| `YDC_API_KEY` | — | You.com API Key |
| `LOG_LEVEL` | `info` | 日志级别：`info` 或 `debug` |
| `MODE` | `stdio` | 传输方式：`stdio`、`http` 或 `both` |
| `PORT` | `3000` | HTTP 服务端口（`MODE=http` 或 `both` 时） |
| `OUTPUT_STYLE` | `normal` | `compact` 开启 token 优化输出 |
| `SNIPPET_LENGTH` | `200` | 摘要最大字符数（60–500） |
| `MAX_FULL_RESULTS` | `3` | compact 模式下的完整结果数 |
| `MIN_CONFIDENCE` | `0` | 置信度过滤阈值（0.0–3.0） |
| `SEMANTIC_DEDUP` | `false` | 语义去重（需 `pip install model2vec`） |
| `DEDUP_THRESHOLD` | `0.85` | 语义去重的余弦相似度阈值 |
| `SEMANTIC_RERANK` | `false` | 语义重排（需 `pip install model2vec`） |
| `RERANK_TOP_K` | `5` | 语义重排保留的结果数 |

**零配置即可使用** — 8 个免费引擎无需任何 API Key。

### 工具可见性

```bash
# 只启用指定工具
ENABLED_TOOLS=free_search,free_search_advanced,free_search_news

# 禁用指定工具
DISABLED_TOOLS=free_extract,fetch_github_readme
```

`DISABLED_TOOLS` 优先级高于 `ENABLED_TOOLS`。

### 引擎过滤

```bash
ALLOWED_ENGINES=sogou,baidu    # 只用中文引擎
DENIED_ENGINES=yandex,mojeek   # 排除特定引擎
```

---

## CLI

`agent-search-mcp` 附带独立的命令行工具（`fasm`）。

```bash
# 搜索
fasm search "TypeScript MCP server"
fasm search "关键词" --count 5 --engines bing,baidu,youcom --json

# 提取网页
fasm extract "https://example.com"
fasm extract "https://example.com" --json

# HTTP 服务
fasm serve --port 8080
```

---

## 基准测试

基于 [30 条查询](./benchmarks/queries.json)（15 EN + 15 ZH，覆盖技术、新闻、通用知识），默认配置，无 API Key。

| 指标 | 结果 |
|------|------|
| **成功率** | **30/30 (100%)** |
| **瀑布效率** | **100%** 在阶段一停止 |
| **平均引擎数** | **2.0**（对比 8 引擎全量 = **减少 75% 调用**）|
| **多源多样性** | DDG 与搜狗 **0% URL 重叠** |
| **平均置信度** | 0.64 / 1.0 |
| **平均延迟** | 15.2s（P50: 14.8s, P95: 18.4s）|
| **Token 节省（compact）** | **28.7%**（1582 → 1128 tokens）|
| **Token 节省（aggressive）** | **35.5%**（1582 → 1020 tokens）|

→ [完整方法与报告](./benchmarks/)

---

## 配套工具

**🛡️ [mcp-slim-guard](https://github.com/lennney/mcp-slim-guard)** — 为你的 MCP 栈添加安全 + 压缩

```bash
npm install -g mcp-slim-guard
mcp-slim-guard init
mcp-slim-guard start
```

```
AI Agent → mcp-slim-guard (安全 + 压缩) → agent-search-mcp
```

| 功能 | 效果 |
|------|------|
| **Schema 压缩** | 回收约 83% 上下文窗口 — 1,736 → 300 tokens |
| **工具白名单** | Glob 模式控制哪些工具可调用 |
| **SSRF 保护** | IP 黑名单 + 域名白名单，拦截内网请求 |
| **注入检测** | 17 种启发式模式，防提示注入/SQL/Shell |
| **速率限制** | 每工具 Token Bucket，默认 60 req/min |
| **审计日志** | 结构化 JSON 日志，支持轮转 + gzip |

---

## 开发

```bash
git clone https://github.com/lennney/agent-search-mcp.git
cd agent-search-mcp
npm install
npm run build
npm test
npm run dev        # stdio 模式
npm run dev:http   # HTTP 模式（端口 3000）
```

---

## 许可证

[Apache 2.0](LICENSE)

基于 [open-websearch](https://github.com/Aas-ee/open-websearch) by Aas-ee。
