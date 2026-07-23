# Agent Search MCP

> 🔍 免费多源搜索 MCP 服务器 — 多源验证、Token 优化、瀑布式搜索、MCP 原生、可自托管。

[![License](https://img.shields.io/github/license/lennney/agent-search-mcp)](LICENSE)
[![npm version](https://img.shields.io/npm/v/agent-search-mcp)](https://www.npmjs.com/package/agent-search-mcp)
[![npm downloads](https://img.shields.io/npm/dm/agent-search-mcp)](https://www.npmjs.com/package/agent-search-mcp)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![Tests](https://img.shields.io/badge/tests-448%20passing-brightgreen)](https://github.com/lennney/agent-search-mcp)

**兼容 Claude Code、Cursor、Windsurf、Codex、Hermes、OpenClaw 等所有 MCP 客户端。**

---

[中文](#为什么选择-agent-search-mcp) · [English](README.md) · [安装](#quick-start) · [工具文档](#tools) · [竞品对比](#competitor-comparison)

---

## 为什么选择 Agent Search MCP

**AI Agent 需要搜索互联网，但现有方案都有问题：**

| 方案 | 价格 | 问题 |
|------|------|------|
| **Tavily** | $0.01/次 | 搜索多了成本高，月费 $20-50+ |
| **Exa** | $50/月起 | 语义搜索强但太贵 |
| **Brave Search** | 2000 次/月免费，之后 $3/1000 | 免费额度不够 |
| **Firecrawl** | $83/10万页 | 搜索+抓取一体，但量大了贵 |
| **Perplexity Sonar** | $5/千次 + token | 答案引擎，无法评估原始来源 |
| **Serper** | $0.30/千次 | 谷歌 SERP，无内容提取 |
| **DDG MCP** | 免费 | 单源、无验证、无去重、结果不稳定 |

**Agent Search MCP 的差异化：**

### 核心搜索能力

| 特性 | 说明 |
|------|------|
| **默认免费** | DuckDuckGo + Sogou + Bing + Baidu 为核心，无需 API Key。Brave + Tavily + Exa 作为可选付费 fallback |
| **瀑布式渐进搜索** 🆕 | 3 阶段置信度门控搜索：(1) DDG+Sogou → 检查 → (2) Bing+Baidu → 检查 → (3) Brave+Tavily+Exa。置信度达标即停，节省 50-75% 引擎调用 |
| **多源验证** | 跨引擎交叉验证，每个结果有置信度评分（1-3），≥2 的结果经过至少 2 个引擎验证 |
| **内容丰富化** 🆕 | 低置信度/摘要过短的结果，自动通过 Jina Reader 提取全文回填。置信度提升 +0.33（上限 1.0） |
| **域名权威评分** 🆕 | `.edu`/`.gov`/`.ac.xx` 域名 +0.12；高质量站点（wikipedia、stackoverflow、arxiv）加分；低质域名扣分 |
| **自适应查询扩展** 🆕 | 置信度不足时自动生成 2 个备选查询重搜，4 种规则策略（vs-split、前缀剥离、核心关键词、技术同义词），无需 LLM |

### Token 与成本优化

| 特性 | 说明 |
|------|------|
| **Token 优化** | 标题 ≤100 字符，摘要 ≤200 字符，URL + 标题去重。节省 ~40-50% token 消耗 |
| **渐进式披露** | 3 个工具按复杂度递增：`free_search` 快速问答、`free_search_advanced` 过滤搜索+瀑布流程、`free_extract` 页面提取。Agent 按需发现 |

### 可靠性

| 特性 | 说明 |
|------|------|
| **Fallback 机制** | 免费引擎优先，付费引擎备用。自动合并、去重、评分 |
| **健康监控** | 实时追踪 Provider 健康状态，失败 Provider 自动过滤 |
| **限速保护** | 每个 Provider 最小请求间隔 1 秒 |
| **智能缓存** | LRU 缓存，60 秒 TTL，最多 1000 条目 |

### 安全

| 特性 | 说明 |
|------|------|
| **Prompt 注入检测** | 阻拦搜索请求中的注入模式 |
| **输出边界标记** | 系统输出和搜索结果之间的清晰分隔 |
| **钓鱼 URL 过滤** | 检测并标记可疑 URL |
| **SSRF 保护** | 禁止私网 IP、localhost、元数据端点 |
| **安全元数据** | 每次响应附带安全上下文 |

---

## 成本对比

假设每天搜索 100 次：

| 方案 | 月费 | 年费 |
|------|------|------|
| Tavily | ~$30 | ~$360 |
| Exa | $50 | $600 |
| Brave Search | ~$15 | ~$180 |
| Firecrawl | ~$25 | ~$300 |
| Perplexity Sonar | ~$30 | ~$360 |
| Serper | ~$9 | ~$108 |
| **Agent Search MCP** | **$0** | **$0** |

---

## Competitor Comparison

| Feature | Agent Search MCP | Tavily | Exa | Brave Search | Firecrawl | Perplexity Sonar | Serper | DDG MCP |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **价格** | 免费 | $0.01/次 | $50/月 | $3/1000 | $83/10万页 | $5/千次+token | $0.30/千次 | 免费 |
| **API Key** | 不需要 | 需要 | 需要 | 需要 | 需要 | 需要 | 需要 | 需要 |
| **免费额度** | 无限 | 1千/月 | $10 额度 | 2千/月 | 有限 | 无 | 2.5千/月 | 无限 |
| **多源验证** | ✅ 4+ 引擎 | ❌ 单源 | ❌ 单源 | ❌ 单源 | ❌ 单源 | ❌ 单源 | ❌ 单源 | ❌ 单源 |
| **瀑布搜索** | ✅ 置信度门控 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **内容丰富化** | ✅ 自动提取 | ✅ (内置) | ✅ (内置) | ❌ | ✅ (内置) | ✅ (合成) | ❌ | ❌ |
| **查询扩展** | ✅ 规则引擎 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **置信度评分** | ✅ 1-3 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **域名权威** | ✅ Edu/Gov 加分 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **去重** | ✅ URL+标题 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Token 优化** | ✅ ~40-50% | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **中文搜索** | ✅ 搜狗+百度 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **语义搜索** | ❌ (规划中) | ❌ | ✅ 神经 | ❌ | ❌ | ❌ | ❌ | ❌ |
| **答案引擎** | ❌ (规划中) | ❌ | ❌ | ❌ | ❌ | ✅ 合成 | ❌ | ❌ |
| **人/公司搜索** | ❌ (规划中) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **MCP 原生** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **可自托管** | ✅ | ❌ 仅云端 | ❌ 仅云端 | ❌ 仅云端 | ❌ 仅云端 | ❌ 仅云端 | ❌ 仅云端 | ✅ |
| **安全** | ✅ 注入保护 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **依赖数量** | 4 | 12+ | 15+ | 8 | 10+ | 8+ | 5 | 3 |

**核心差异：**

1. **默认免费** — 无需 API Key，无需信用卡，无限制。DDG + Sogou + Bing + Baidu 开箱即用
2. **多源验证** — 跨引擎交叉验证，置信度告诉你结果有多可靠
3. **瀑布式搜索** — 独特的多阶段置信度门控搜索，质量达标即停，节省引擎调用和 Token
4. **Token 优化** — 智能截断和去重减少 ~40-50% 消耗
5. **中国搜索引擎** — 搜狗 + 百度提供原生中文搜索，不需要翻译层
6. **安全性** — 内置 Prompt 注入检测、钓鱼 URL 过滤、输出边界标记

**我方差距（规划中）：**
- **语义/神经搜索** — Exa 的神经索引处理概念型查询。可添加 embedding 搜索
- **答案引擎** — 类似 Perplexity 的多源结果 LLM 合成直接答案
- **人/公司搜索** — Exa 的实体索引，用于销售/情报场景

---

## 快速开始

### 前置条件

- Node.js >= 18

安装即用，无需额外依赖。

> **可选：** 安装 Python + ddgs 可获得更好的 DuckDuckGo 结果：
> ```bash
> pip install ddgs
> ```
> 不安装时 DuckDuckGo 自动使用 Node.js HTML 引擎。

### 安装

```bash
# 方式 1：npx（推荐）
npx agent-search-mcp

# 方式 2：全局安装
npm install -g agent-search-mcp
```

### Platform Setup

<details>
<summary><b>Hermes</b></summary>

```yaml
# ~/.hermes/config.yaml
mcp_servers:
  agent-search:
    command: npx
    args: ["agent-search-mcp"]
```
</details>

<details>
<summary><b>Claude Code</b></summary>

```json
// ~/.claude/mcp.json
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["agent-search-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>Cursor</b></summary>

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["agent-search-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>Windsurf</b></summary>

```json
// ~/.codeium/windsurf/mcp_config.json
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["agent-search-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>OpenClaw</b></summary>

```typescript
// openclaw.config.ts
{
  mcpServers: {
    "agent-search": {
      command: "npx",
      args: ["agent-search-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>Codex</b></summary>

```json
// ~/.codex/mcp.json
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["agent-search-mcp"]
    }
  }
}
```
</details>

---

## CLI 使用

agent-search-mcp 也可以作为 CLI 工具使用。

### 安装

```bash
npm install -g agent-search-mcp
```

### 搜索

```bash
# 基础搜索
fasm search "TypeScript MCP server"

# 指定数量和引擎
fasm search "query" --count 5 --engines bing,baidu

# JSON 输出
fasm search "query" --json
```

### 提取网页

```bash
fasm extract "https://example.com"
fasm extract "https://example.com" --json
```

### 启动 HTTP 服务

```bash
fasm serve --port 8080
```

### 帮助

```bash
fasm --help
```

---

## Tools

### `free_search`

基础搜索，多源验证。

```json
{
  "query": "TypeScript MCP server",
  "count": 5
}
```

**返回：** 带置信度评分（1-3）的搜索结果数组。

### `free_search_advanced`

高级搜索，支持瀑布式渐进搜索、过滤和内容丰富化。

```json
{
  "query": "MCP server",
  "count": 10,
  "min_confidence": 2,
  "time_range": "week",
  "language": "zh",
  "include_domains": ["github.com"],
  "exclude_domains": ["reddit.com"]
}
```

**参数：**
- `min_confidence` (1-3)：只返回经过 N+ 引擎验证的结果
- `time_range`：day、week、month、year
- `language`：auto、en、zh
- `include_domains`：只搜索这些域名
- `exclude_domains`：排除这些域名

**瀑布流程（默认开启）：**
1. 阶段 1：DDG + Sogou → 检查置信度篮子
2. 阶段 2（如果需要）：Bing + Baidu → 检查篮子
3. 阶段 3（如果需要）：Brave + Tavily + Exa（付费引擎）
4. 内容丰富化：低置信度结果自动通过 Jina Reader 提取全文
5. 查询扩展（篮子仍不足）：自动生成备选查询

### `free_extract`

URL 内容提取，获取完整 Markdown。

```json
{
  "url": "https://example.com/article",
  "max_length": 5000
}
```

**返回：** Markdown 格式内容及元数据。超过 `max_length` 的完整文本存储在磁盘。

---

## Resources

### `search://capabilities`

返回描述所有可用工具和功能的 Markdown 文档。Agent 可按需发现能力。

### `search://health`

返回 JSON 格式的 Provider 健康状态。用于监控和调试。

---

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BRAVE_API_KEY` | Brave Search API key（2000 免费/月） | No |
| `TAVILY_API_KEY` | Tavily API key（1000 免费/月） | No |
| `EXA_API_KEY` | Exa API key（1000 免费/月） | No |
| `LOG_LEVEL` | 日志级别（info, debug） | No |

**零配置可用** — DDG + Sogou + Bing + Baidu 基础搜索无需 API Key。

### 启用付费引擎

设置环境变量以启用付费引擎 fallback：

```bash
export BRAVE_API_KEY=your_key_here
export TAVILY_API_KEY=your_key_here
export EXA_API_KEY=your_key_here
```

---

## 依赖项

| 依赖 | 许可证 | 用途 |
|------|--------|------|
| @modelcontextprotocol/sdk | MIT | MCP 协议 |
| zod | MIT | Schema 验证 |
| pino | MIT | 日志 |
| yaml | ISC | 配置解析 |
| cheerio | MIT | DuckDuckGo HTML 解析器（Node.js 原生） |
| ddgs (Python, 可选) | MIT | 增强的 DuckDuckGo 后端（绕过反爬） |

---

## Architecture

```
Agent
  ↓ MCP Protocol (stdio / HTTP)
MCP Server
  ├── Tools Layer
  │   ├── free_search (快速查询)
  │   ├── free_search_advanced (瀑布 + 过滤)
  │   └── free_extract (页面提取)
  ├── Aggregation Layer
  │   ├── Waterfall Search Engine      ← 新增
  │   │   ├── Phase 1: DDG + Sogou
  │   │   ├── Phase 2: Bing + Baidu
  │   │   └── Phase 3: Brave + Tavily + Exa (付费)
  │   ├── Content Enricher (Jina)      ← 新增
  │   ├── Domain Authority Scorer       ← 新增
  │   ├── Query Expander (Rule Engine)  ← 新增
  │   ├── Confidence Basket Checker     ← 新增
  │   ├── Top-1 Snippet 合并
  │   ├── URL + 标题去重
  │   ├── 评分 + 置信度
  │   └── 输出截断
  ├── Security Layer
  │   ├── Prompt 注入检测
  │   ├── 输出边界标记
  │   ├── 钓鱼 URL 过滤
  │   └── 安全元数据
  ├── Fallback Chain
  │   ├── 阶段 1：免费引擎 (DDG + Sogou + Bing + Baidu)
  │   └── 阶段 2：付费引擎 (Brave + Tavily + Exa)
  └── Infrastructure
      ├── Cache (LRU, 60s TTL)
      ├── Rate Limiter (1s per provider)
      ├── Health Tracker
      └── SSRF Protection
```

---

## 项目数据

| 指标 | 数值 |
|------|------|
| 测试数量 | **149**（13 个文件） |
| 源码量 | ~2,500 行 TypeScript |
| 免费引擎 | 4（DDG + Sogou + Bing + Baidu） |
| 付费引擎 | 3（Brave + Tavily + Exa） |
| npm 生产依赖 | 4 |
| 引擎总计 | 7 |

---

## Documentation / 文档

| Document | Description |
|----------|-------------|
| [PRD](docs/prd.md) | 产品需求文档 |
| [Architecture](docs/architecture.md) | 技术架构 |
| [Plan](docs/plan.md) | 实现计划 |
| [Review Results](docs/review-results.md) | 5 团队评审结果 |
| [Fork Plan](docs/fork-plan.md) | Fork 改造方案 |
| [CHANGELOG](CHANGELOG.md) | 版本历史 |

---

## Development

```bash
# 克隆
git clone https://github.com/lennney/agent-search-mcp.git
cd agent-search-mcp

# 安装
npm install

# 构建
npm run build

# 测试
npm test

# 运行
npm start
```

---

## Roadmap

- [x] DDG + Sogou 免费引擎、多源验证、去重、评分
- [x] Bing + Baidu 引擎、HTTP/SSE 模式、安全层、配置模块
- [x] CLI 二进制 (`fasm`)、ContextManager、双模式服务
- [x] **瀑布搜索、内容丰富化、域名权威、查询扩展** ← 当前版本
- [ ] 语义/神经搜索（基于 embedding 的概念匹配）
- [ ] 答案引擎模式（多源结果 + LLM 综合）
- [ ] 实体搜索（人物、公司、代码）
- [ ] 插件系统（自定义引擎）
- [ ] 浏览器提取（Playwright）

---

## License

[Apache License 2.0](LICENSE)

Based on [open-websearch](https://github.com/Aas-ee/open-websearch) by Aas-ee.

```
Copyright 2025 Open-WebSearch MCP Server Contributors
Based on open-websearch by Aas-ee (Apache 2.0).
Modified by Agent Search MCP Contributors.
Copyright 2026 Agent Search MCP Contributors
```

---

## 🔗 推荐搭配

**🛡️ [mcp-slim-guard](https://github.com/lennney/mcp-slim-guard)** — 给你的 MCP 栈添加安全 + 压缩

```bash
npm install -g mcp-slim-guard
mcp-slim-guard init
mcp-slim-guard start
```

agent-search-mcp + mcp-slim-guard = 搜索 + 安全 + Token 节省三合一：

| 功能 | 效果 |
|------|------|
| **Schema 压缩** | 节省 ~83% 上下文窗口 — 1,736 → 300 tokens |
| **工具白名单** | Glob 模式控制哪些工具可调用 |
| **SSRF 保护** | IP 黑名单 + 域名白名单，阻止内网请求 |
| **注入检测** | 17 种启发式模式，防提示注入/SQL/Shell |
| **速率限制** | 每工具 Token Bucket，默认 60 req/min |
| **审计日志** | 结构化 JSON 日志，支持轮转 + gzip |

```
AI Agent → mcp-slim-guard (安全 + 压缩) → agent-search-mcp
```

---

## Contributing

欢迎贡献！请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。
