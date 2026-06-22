# Agent Search MCP

> 🔍 免费多源搜索 MCP 服务器 — 多源验证、Token 优化、MCP 原生、可自托管。

[![License](https://img.shields.io/github/license/lennney/agent-search-mcp)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![Tests](https://img.shields.io/badge/tests-65%20passing-brightgreen)](https://github.com/lennney/agent-search-mcp)

**兼容 Hermes、Claude Code、Cursor、Windsurf、OpenClaw、Codex 等所有 MCP 客户端。**

---

[中文](#为什么选择-agent-search-mcp) · [English](#why-agent-search-mcp) · [安装](#quick-start) · [工具文档](#tools) · [竞品对比](#competitor-comparison)

---

## 为什么选择 Agent Search MCP

**AI Agent 需要搜索互联网，但现有方案都有问题：**

| 方案 | 价格 | 问题 |
|------|------|------|
| **Tavily** | $0.01/次，月费 $20-50+ | 贵 |
| **Exa** | $50/月起 | 语义搜索强但贵 |
| **Brave Search** | 2000 次/月免费，之后 $3/1000 | 免费额度不够 |
| **DDG MCP** | 免费 | 单源、无验证、无去重、结果不稳定 |
| **open-websearch** | 免费 | 300MB+ 依赖、无 token 优化 |

**Agent Search MCP 的差异化：**

### 1. 🆓 免费 + 高质量
- DuckDuckGo + Sogou 为核心引擎，无需 API Key
- 开箱即用，零配置
- 付费引擎（Brave/Tavily）作为 fallback

### 2. 🎯 多源验证
- 跨引擎交叉验证，每个结果有置信度评分（1-3）
- 单源搜索可能返回不可靠结果，多源验证提高可信度
- 置信度 ≥2 的结果经过至少 2 个引擎验证

### 3. 💰 Token 优化
- 标题 ≤100 字符，摘要 ≤200 字符，智能截断
- URL + 标题 Jaccard 去重，去除冗余
- 节省 ~40-50% token 消耗

**示例：** 搜索 "TypeScript MCP server tutorial"，原始 50 条结果 → 去重后 35 条 → 截断+置信度过滤后 20 条高质量结果，token 减少 ~40%。

### 4. 🔧 渐进式披露
- 3 个工具按复杂度递增，Agent 按需发现
- `free_search`：基础搜索，快速问答
- `free_search_advanced`：高级搜索，支持日期/域名/语言过滤
- `free_extract`：URL 内容提取，获取完整页面

### 5. 🔗 Fallback 机制
```
阶段 1：DuckDuckGo + Sogou（免费，并发）
    ↓ 结果不足
阶段 2：Brave + Tavily（付费，免费额度）
    ↓ 合并 + 去重 + 评分
最终：带置信度的排序结果
```

### 6. 🏥 健康监控
- 实时追踪 Provider 健康状态
- 失败 Provider 自动过滤，无需手动干预
- 结构化日志（pino）

### 7. 🛡️ 内置安全
- Prompt 注入检测 — 标记可疑内容（如"忽略之前的指令"）
- 输出边界标记 — XML 标签分离数据与指令
- 钓鱼 URL 过滤 — 检测可疑模式（IP URL、typosquatting、短链）
- 安全元数据 — 每条响应附加安全说明

---

## 适用人群

| 人群 | 场景 |
|------|------|
| **AI Agent 开发者** | Hermes、OpenClaw、自定义 Agent 需要搜索能力 |
| **IDE 用户** | Claude Code、Cursor、Windsurf 的 AI 搜索 |
| **MCP 工具开发者** | 构建 MCP 兼容工具 |
| **中文用户** | 需要中文搜索（搜狗集成） |
| **成本敏感用户** | 不想为搜索付费，需要免费方案 |

---

## 成本对比

假设每天搜索 100 次：

| 方案 | 月费 | 年费 |
|------|------|------|
| Tavily | ~$30 | ~$360 |
| Exa | $50 | $600 |
| Brave Search | ~$15 | ~$180 |
| **Agent Search MCP** | **$0** | **$0** |

---

## Competitor Comparison

| Feature | Agent Search MCP | Tavily | Exa | Brave Search | DDG MCP |
|---------|:---:|:---:|:---:|:---:|:---:|
| **价格** | 免费 | $0.01/次 | $50/月 | $3/1000 | 免费 |
| **API Key** | 不需要 | 需要 | 需要 | 需要 | 需要 |
| **多源验证** | ✅ 2-4 引擎 | ❌ 单源 | ❌ 单源 | ❌ 单源 | ❌ 单源 |
| **置信度评分** | ✅ 1-3 | ❌ | ❌ | ❌ | ❌ |
| **去重** | ✅ URL+标题 | ❌ | ❌ | ❌ | ❌ |
| **Token 优化** | ✅ ~40-50% | ❌ | ❌ | ❌ | ❌ |
| **中文搜索** | ✅ 搜狗 | ❌ | ❌ | ❌ | ❌ |
| **MCP 原生** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **可自托管** | ✅ | ❌ 仅云端 | ❌ 仅云端 | ❌ 仅云端 | ✅ |
| **渐进式披露** | ✅ 3 工具 | ❌ | ❌ | ❌ | ❌ |
| **健康监控** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Fallback** | ✅ 免费→付费 | ❌ | ❌ | ❌ | ❌ |
| **安全** | ✅ 注入保护 | ❌ | ❌ | ❌ | ❌ |
| **依赖数量** | 4 | 12+ | 15+ | 8 | 3 |

**核心差异：**

1. **默认免费** — 无需 API Key，无需信用卡，无限制。DuckDuckGo + Sogou 开箱即用。
2. **多源验证** — 跨引擎交叉验证，置信度告诉你结果有多可靠。
3. **Token 优化** — 智能截断和去重减少 ~40-50% token 消耗，对成本敏感的应用至关重要。
4. **中文支持** — 搜狗引擎提供原生中文搜索，不是翻译层。
5. **渐进式披露** — 3 个工具按复杂度递增，Agent 按需发现能力（Exa 模式）。
6. **内置安全** — Prompt 注入检测、输出边界标记、钓鱼 URL 过滤。

---

## 快速开始

### 前置要求

- Node.js >= 18
- Python 3 + `ddgs` 库：
```bash
pip install ddgs
```

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

## Tools

### `free_search`

基础搜索，多源验证。

```json
{
  "query": "TypeScript MCP server",
  "count": 5
}
```

**返回：** 带置信度评分的搜索结果数组。

### `free_search_advanced`

高级搜索，支持过滤。

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

### `free_extract`

URL 内容提取，获取完整 Markdown。

```json
{
  "url": "https://example.com/article",
  "max_length": 5000
}
```

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
| `LOG_LEVEL` | 日志级别（info, debug） | No |

**零配置可用** — 基础搜索无需 API Key。

### 启用付费引擎

设置环境变量以启用付费引擎 fallback：

```bash
export BRAVE_API_KEY=your_key_here
export TAVILY_API_KEY=your_key_here
```

---

## 依赖项

| 依赖 | 许可证 | 用途 |
|------|--------|------|
| @modelcontextprotocol/sdk | MIT | MCP 协议 |
| zod | MIT | Schema 验证 |
| pino | MIT | 日志 |
| yaml | ISC | 配置解析 |
| ddgs (Python) | MIT | DuckDuckGo 搜索后端（绕过反爬） |

**注意：** `ddgs` 是 Python 库，通过子进程调用。需要单独安装：
```bash
pip install ddgs
```

---

## Architecture

```
Agent
  ↓ MCP Protocol (stdio)
MCP Server
  ├── Tools Layer (渐进式披露)
  │   ├── free_search (默认)
  │   ├── free_search_advanced (可选)
  │   └── free_extract (可选)
  ├── Aggregation Layer
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
  │   ├── 阶段 1：免费引擎 (DDG + Sogou)
  │   └── 阶段 2：付费引擎 (Brave + Tavily)
  └── Infrastructure
      ├── Cache (LRU, 60s TTL)
      ├── Rate Limiter (1s per provider)
      ├── Health Tracker
      └── SSRF Protection
```

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

- [ ] v0.1.0 — 初始版本，DDG + Sogou
- [ ] v0.2.0 — Brave + Tavily fallback
- [ ] v0.3.0 — 健康监控 + 限速
- [ ] v1.0.0 — 稳定版本 + 完整文档
- [ ] v1.1.0 — 插件系统，支持自定义引擎
- [ ] v2.0.0 — 浏览器提取（Playwright）

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

## Contributing

欢迎贡献！请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## Keywords

MCP server, Model Context Protocol, AI agent search, free web search, multi-source search, DuckDuckGo MCP, Sogou search, token optimization, Hermes MCP, Claude Code MCP, Cursor MCP, AI tool, web search for agents, search aggregation, confidence scoring, prompt injection protection, security, 中文搜索, MCP 服务器, AI Agent 搜索, 免费搜索, 搜狗搜索, MCP 兼容, 自托管搜索, 中文 MCP, 中文 AI 搜索, 安全搜索
