# Agent Search MCP

> 🔍 AI Agent 的免费搜索引擎——多源验证，省 token，MCP 原生

[![License](https://img.shields.io/github/license/lennney/agent-search-mcp)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)

**支持 Hermes、Claude Code、Cursor、Windsurf、OpenClaw 等所有 MCP 客户端**

---

[English](#features) · [中文](#特性) · [安装](#快速开始) · [文档](#文档)

---

## 快速开始

```bash
# 方式 1: npx (推荐)
npx agent-search-mcp

# 方式 2: 全局安装
npm install -g agent-search-mcp
```

### 平台配置

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

---

## 特性

### 🆓 默认免费

无需 API key，开箱即用。使用 DuckDuckGo + Sogou 搜索引擎。

| 引擎 | 类型 | 需要 API Key | 覆盖范围 |
|------|------|-------------|----------|
| DuckDuckGo | 免费 | ❌ | 全球 |
| Sogou | 免费 | ❌ | 中文 |
| Brave Search | 付费 (Free Tier) | 可选 | 全球 |
| Tavily | 付费 (Free Tier) | 可选 | 全球 |

### 🎯 多源验证

搜索结果在多个引擎间交叉验证。每条结果包含**置信度分数** (1-3)，表示被多少个引擎返回。

```json
{
  "title": "构建 MCP 服务器",
  "url": "https://example.com/mcp",
  "snippet": "如何构建 MCP 服务器...",
  "confidence": 2  // 被 2 个引擎验证
}
```

### 💰 省 Token

精简输出减少 ~40-50% token 消耗：

| 优化 | 节省 |
|------|------|
| 每个 URL 只取最长 snippet | ~25% |
| 标题截断 (≤100 字符) | ~15% |
| 描述截断 (≤200 字符) | ~15% |
| 去重 | ~10% |
| 置信度过滤 | ~10% |

### 🔧 渐进式披露

3 个工具，Agent 按需发现：

| 工具 | 用途 | 适用场景 |
|------|------|----------|
| `free_search` | 基础搜索 | 快速问题 |
| `free_search_advanced` | 高级搜索 | 日期/域名/高置信度过滤 |
| `free_extract` | 内容提取 | 读取完整页面 |

---

## 工具

### `free_search`

基础搜索，多源验证。

```json
{
  "query": "TypeScript MCP server",
  "count": 5
}
```

### `free_search_advanced`

高级搜索，支持过滤。

```json
{
  "query": "MCP 服务器",
  "count": 10,
  "min_confidence": 2,
  "time_range": "week",
  "language": "zh",
  "include_domains": ["github.com"],
  "exclude_domains": ["reddit.com"]
}
```

**参数说明：**
- `min_confidence` (1-3)：只返回被 N+ 个引擎验证的结果
- `time_range`：day, week, month, year
- `language`：auto, en, zh
- `include_domains`：只搜索这些域名
- `exclude_domains`：排除这些域名

### `free_extract`

提取 URL 全文内容为 Markdown。

```json
{
  "url": "https://example.com/article",
  "max_length": 5000
}
```

---

## 资源

### `search://capabilities`

返回 Markdown 格式的能力说明文档。Agent 可按需发现可用功能。

### `search://health`

返回各引擎健康状态 JSON：

```json
[
  {
    "provider": "duckduckgo",
    "lastSuccess": 1719000000000,
    "errorCount": 0,
    "avgLatency": 450,
    "isHealthy": true
  }
]
```

---

## 配置

### 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `BRAVE_API_KEY` | Brave Search API Key (2000 免费/月) | 否 |
| `TAVILY_API_KEY` | Tavily API Key (1000 免费/月) | 否 |
| `LOG_LEVEL` | 日志级别 (info, debug) | 否 |

**零配置可用** — 不设置任何 API key 也能搜索。

### 启用付费引擎

设置环境变量，在免费结果不足时自动 fallback 到付费引擎：

```bash
export BRAVE_API_KEY=your_key
export TAVILY_API_KEY=your_key
```

---

## 架构

```
Agent
  ↓ MCP Protocol (stdio)
MCP Server
  ├── 工具层 (渐进式披露)
  │   ├── free_search (默认)
  │   ├── free_search_advanced (可选)
  │   └── free_extract (可选)
  ├── 聚合层
  │   ├── Top-1 Snippet 合并
  │   ├── URL + 标题去重
  │   ├── 评分 + 置信度
  │   └── 输出截断
  ├── Fallback 链
  │   ├── Phase 1: 免费引擎 (DDG + Sogou)
  │   └── Phase 2: 付费引擎 (Brave + Tavily)
  └── 基础设施
      ├── 缓存 (LRU, 60s TTL)
      ├── 限速 (每引擎 1s 间隔)
      ├── 健康追踪
      └── SSRF 防护
```

---

## 文档

| 文档 | 说明 |
|------|------|
| [PRD](docs/prd.md) | 产品需求文档 |
| [架构设计](docs/architecture.md) | 技术架构 |
| [实现计划](docs/plan.md) | 实现计划 |
| [评审结果](docs/review-results.md) | 5 团队评审结果 |
| [Fork 计划](docs/fork-plan.md) | Fork 改造计划 |
| [CHANGELOG](CHANGELOG.md) | 版本历史 |

---

## 开发

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

## 贡献

欢迎贡献！请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 关键词

MCP 服务器, Model Context Protocol, AI Agent 搜索, 免费搜索, 多源搜索, DuckDuckGo MCP, 搜狗搜索, Token 优化, Hermes MCP, Claude Code MCP, Cursor MCP, AI 工具, Agent 搜索, 搜索聚合, 置信度评分, 中文搜索, 免费 MCP
