# agent-search-mcp 多平台兼容性设计评审报告

**评审日期**: 2026-06-22  
**评审对象**: agent-search-mcp 设计文档集合（doc/plans/ + architecture docs）  
**评审范围**: 多平台兼容性设计（Hermes/Claude Code/Cursor/Windsurf/OpenClaw）

---

## 综合评分

| 维度 | 评分 (1-5) | 说明 |
|------|:----------:|------|
| **平台配置正确性** | ⭐⭐⭐ (3/5) | Hermes/Claude Code 配置正确；Cursor 基本正确；Windsurf 配置路径有误；OpenClaw 完全缺失 |
| **工具命名规范** | ⭐⭐⭐⭐ (4/5) | 命名一致且清晰，但存在语义歧义和资源命名不一致问题 |
| **文档清晰度** | ⭐⭐⭐ (3/5) | 设计文档丰富但分散、版本混乱，缺乏统一 README 和平台配置说明 |
| **平台特定考量** | ⭐⭐ (2/5) | 缺乏对各平台差异化需求的深入分析，基础假设和关键的 env 配置缺失 |

### 综合评分: **3.0 / 5.0** — 方向正确，但多平台兼容性设计尚未完成，需补充多项内容才能达到发布标准。

---

## 一、平台配置正确性评估

### 1.1 Hermes ✅

- 配置路径：`~/.hermes/config.yaml` — **正确**
- 格式：`mcp_servers` → `command: npx` `args: ["agent-search-mcp"]` — **正确**
- 问题：缺少 `env` 字段示例。用户需要传递 `BRAVE_API_KEY` 等环境变量时，需要额外的环境变量设置说明。

### 1.2 Claude Code ✅

- 配置路径：`~/.claude/mcp.json` — **正确**
- 格式：`mcpServers` → `command: npx` `args: ["agent-search-mcp"]` — **正确**
- 问题：同样缺少 `env` 字段示例。Claude Code 的 MCP json 配置支持内联 `env` 对象传递 API key，但文档未提及。

### 1.3 Cursor ⚠️

- 配置路径：`.cursor/mcp.json` — **正确**（项目级配置）
- 格式：`mcpServers` → `command: npx` `args: ["agent-search-mcp"]` — **正确**
- 遗漏：Cursor 还支持全局 MCP 配置（`~/.cursor/mcp.json`），以及 `env` 字段；文档未覆盖。

### 1.4 Windsurf ❌

- **文档显示**：`.cursor/mcp.json` — **错误**
- **实际路径**：Windsurf 的 MCP 配置文件路径为：
  - 全局：`~/.codeium/windsurf/mcp_config.json`
  - 项目级：`.windsurf/mcp_config.json`
- Windsurf 与 Cursor 使用不同的配置文件名和目录结构，直接复用 `.cursor/mcp.json` 的方案在 Windsurf 上 **不会生效**。

### 1.5 OpenClaw ❌

- **配置示例完全缺失**。所有设计文档均未提供 OpenClaw 集成方式。
- OpenClaw 使用自己的 MCP 配置格式（`~/.openclaw/config.yaml` 或 CLI 参数），与 Hermes/Claude Code 均不同。

### 1.6 跨平台配置代码对比

```yaml
# 文档中的配置（简化后各平台完全相同 —— 实质上是同一段代码复制了 4 次）
# Hermes
mcp_servers:
  agent-search:
    command: npx
    args: ["agent-search-mcp"]

# Claude Code
{ "mcpServers": { "agent-search": { "command": "npx", "args": ["agent-search-mcp"] } } }

# Cursor / Windsurf（错误地合并为同一节）
{ "mcpServers": { "agent-search": { "command": "npx", "args": ["agent-search-mcp"] } } }
```

- **各平台配置实际上是相同的标准格式**，但 Windsurf 的配置路径不同，OpenClaw 格式未知。
- **env 字段从未出现**——这是致命缺失，因为付费引擎 API key 必须通过环境变量传递。

---

## 二、工具命名规范评估

### 2.1 工具清单

| 工具/资源 | 设计方案 | 评价 |
|-----------|----------|------|
| `free_search` | 基础搜索，2-3 参数 | ✅ 命名清晰，snake_case 符合 MCP 惯例 |
| `free_search_advanced` | 高级搜索，多参数 | ✅ 层级明确，"advanced" 暗示更多参数 |
| `free_extract` | URL 内容提取 | ✅ 动词 + 名词，职责清晰 |
| `search://capabilities` | MCP Resource | ⚠️ scheme 为 `search://`，与 server 名 `agent-search` 不一致 |
| `search://health` | Provider 健康状态 | ⚠️ 同上 |

### 2.2 问题

1. **`free_` 前缀语义歧义 (P1)**  
   - `free_search` 命名暗示"免费"，但如果用户**只配置了付费引擎 key**（没有免费引擎可用时），调用 `free_search` 实际上会使用付费 API。  
   - 建议：要么在文档中明确说明 `free_` 指"免费优先，可降级到付费"，要么工具名改为 `search`（去掉 free 前缀），底层逻辑保持 free-first fallback 策略。

2. **资源 URI scheme 不一致 (P2)**  
   - 资源 URI 使用 `search://` scheme，但项目名称是 `agent-search-mcp`，server 注册名为 `agent-search`。建议统一为 `agent-search://health`、`agent-search://capabilities`。

3. **无版本化命名空间 (P3)**  
   - 如果未来工具需要 breaking change（如 `free_search` 的返回格式变更），目前没有版本逃逸路径。但作为 v0.1 版本可以接受。

### 2.3 渐进式披露模式（亮点 ✅）

Exa 模式的"全部可见，描述引导"设计是亮点：
- Agent 可以看到所有 3 个工具
- 工具描述引导 Agent 选择合适的工具（"Best for: Quick questions" / "Best for: Date ranges"）
- 降低了 Agent 的决策成本

---

## 三、文档清晰度评估

### 3.1 优点

- **架构图清晰**：多层架构图完整直观（Tools → Aggregation → Fallback → Engine → Infrastructure）
- **数据流完整**：端到端从 Agent 调用到结果返回的流程描述详尽
- **配置示例存在**：至少列出了主要平台的配置文件格式
- **PRD 评审充分**：PM/安全/技术等多视角评审记录完整

### 3.2 严重问题

#### P0-1: 设计文档碎片化

7+ 份设计文档分布在两个目录：

```
docs/plans/
├── 2026-06-21-agent-search-mcp.md          # v1 计划（mcp-omnisearch fork + DDG/Sogou）
├── 2026-06-21-agent-search-mcp-v2.md        # v2 计划（同上 + 更多细节）
├── 2026-06-21-agent-search-mcp-final.md     # 最终计划（5团队评审后修订）
├── 2026-06-21-agent-search-mcp-fork-plan.md # Fork 方案（open-websearch fork）
└── 2026-06-21-agent-search-mcp-review-results.md # 评审结果

src/features/doc/content/
├── agent-search-mcp-architecture.mdx        # 架构 v1（DDG/Sogou）
├── agent-search-mcp-architecture-v2.mdx     # 架构 v2（DDG/Sogou）
├── agent-search-mcp-prd.mdx                 # PRD
├── agent-search-mcp-prd-review.mdx          # PRD 评审
└── agent-search-mcp-competitive-analysis.mdx # 竞品分析
```

**核心问题**：
- 这些文档存在互相矛盾的设计决策（fork 来源不同、引擎方案不同）
- 没有哪一份文档标记为"当前生效版本"
- `final.md` 已经改为 SearXNG + Brave，但 `architecture-v2.mdx` 仍引用 DDG/Sogou 爬虫
- 实现者无法确定应该遵循哪份文档

#### P0-2: 缺少统一的 README

- 没有任何实际 README.md 文件包含安装说明、配置示例、平台兼容性表
- 所有多平台配置示例在 fork-plan.md 中，但这不是最终 README
- 用户无法一站式获取完整的使用指南

#### P1: 环境变量传递文档缺失

```yaml
# 用户需要知道这个，但文档没写
# 正确的配置应该是：

# Claude Code ~/.claude/mcp.json
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["agent-search-mcp"],
      "env": {
        "BRAVE_API_KEY": "BSA...",
        "TAVILY_API_KEY": "tvly-..."
      }
    }
  }
}

# Hermes ~/.hermes/config.yaml
mcp_servers:
  agent-search:
    command: npx
    args: ['agent-search-mcp']
    env:
      BRAVE_API_KEY: 'BSA...'
      TAVILY_API_KEY: 'tvly-...'
```

#### P1: free_search_advanced 参数不一致

| 文档版本 | 参数集 |
|----------|--------|
| fork-plan.md | —（未定义） |
| v1 计划 | query, count, language, time_range, include_domains, exclude_domains, engines |
| v2 计划 | query, count |
| final.md (评审后) | query, count, min_confidence, time_range, language, include_domains, exclude_domains |
| architecture-v2 | query, count, language, time_range, include_domains, exclude_domains |

7 个参数在不同文档中来回增减，需要锁定最终 schema 并统一所有文档。

---

## 四、平台特定问题

### 4.1 基础假设缺失

1. **Node.js 依赖未声明**  
   - `npx` 需要 Node.js >= 18。如果用户环境无 Node.js，所有配置均无效。
   - 建议在 README 首段注明前置条件并给出 Node.js 安装指引。

2. **npx 首次启动延迟**  
   - `npx agent-search-mcp` 首次执行会下载整个 npm 包（5-30 秒）。在 MCP 客户端启动期间等待 npx 下载可能导致超时。
   - 建议同时提供 `npm install -g agent-search-mcp && agent-search-mcp` 方案，或建议用户预缓存。

3. **npx 网络依赖**  
   - 离线环境或无 npm 注册表访问权限的环境无法使用 npx。
   - 建议增加 Docker 或本地 clone + tsx 运行方案。

### 4.2 各平台差异化需求

| 维度 | Hermes | Claude Code | Cursor | Windsurf | OpenClaw |
|------|--------|-------------|--------|----------|----------|
| MCP 模式 | stdio ✅ | stdio ✅ | stdio ✅ | stdio ✅ | stdio ✅ |
| 配置格式 | YAML | JSON | JSON | JSON | YAML/CLI |
| 配置文件 | `~/.hermes/config.yaml` | `~/.claude/mcp.json` | `.cursor/mcp.json` | `~/.codeium/windsurf/mcp_config.json` | 未知 |
| 支持 `env` | ✅ | ✅ | ✅ | ❓ | ❓ |
| 重启需求 | 重载配置 | 重启 Claude | 重启 Cursor | 重启 Windsurf | ❓ |
| 多 workspace 支持 | ✅ | ❌（全局） | ✅（项目级） | ✅（项目级） | ❓ |

### 4.3 缺少 SSE/HTTP 传输方案

- 所有文档只讨论了 stdio 传输模式
- 但如果未来需要远程搜索（如 CI/CD 环境、远程 Agent），需要 SSE 或 HTTP 传输
- Cursor 和 Windsurf 已开始支持 SSE 模式的 MCP 服务器
- 建议至少架构层面预留传输层抽象

### 4.4 无测试/验证指南

- 没有说明如何验证 MCP Server 在各平台是否正常工作
- 缺少 MCP Inspector 使用指南
- 缺少"配置后如何确认生效"的故障排查步骤

---

## 五、详细改进建议

### P0（必须修复，阻塞发布）

| # | 问题 | 建议 | 影响平台 |
|---|------|------|----------|
| 1 | **Windsurf 配置路径错误** | 将 Windsurf 配置从 `.cursor/mcp.json` 改为 `~/.codeium/windsurf/mcp_config.json`，并注明项目级路径为 `.windsurf/mcp_config.json` | Windsurf |
| 2 | **OpenClaw 配置完全缺失** | 添加 OpenClaw 的配置示例（需确认 OpenClaw 的 MCP 配置格式） | OpenClaw |
| 3 | **env 字段从未出现** | 在所有平台的配置示例中加入 `env` 字段，展示如何传递 `BRAVE_API_KEY` 等环境变量 | 所有平台 |
| 4 | **设计文档碎片化** | 合并所有设计文档为一份"当前生效"的架构设计文档，并标记历史版本状态 | 开发者/维护者 |

### P1（重要，建议在 v1.0 前修复）

| # | 问题 | 建议 |
|---|------|------|
| 5 | **缺少统一 README** | 创建包含安装、配置、平台兼容性表、环境变量说明、troubleshooting 的完整 README.md |
| 6 | **`free_` 命名歧义** | 在文档中明确说明 fallback 策略，或考虑工具改名（如 `search` / `search_advanced` / `extract`） |
| 7 | **`free_search_advanced` 参数未锁定** | 跨所有文档统一参数 schema，建议以 final.md（5团队评审后版本）为准 |
| 8 | **资源 URI scheme 问题** | 将 `search://` 改为 `agent-search://` 以匹配项目名称 |
| 9 | **缺少 Node.js 前置条件说明** | 在 README 首部添加系统要求（Node >= 18, npm） |
| 10 | **npx 延迟问题** | 文档说明首次启动延迟并提供替代方案（全局安装、Docker） |

### P2（可推迟，建议在 v1.x 迭代）

| # | 问题 | 建议 |
|---|------|------|
| 11 | **无 SSE 传输方案** | 架构层面预留传输层抽象，支持 stdio 和 SSE 两种模式 |
| 12 | **无平台验证指南** | 添加 MCP Inspector 和平台级验证步骤 | 
| 13 | **Docker 部署方案缺失** | 增加 Dockerfile 和 docker-compose 示例（尤其是非 Node.js 环境） |
| 14 | **配置示例过于简化** | 为每个平台提供包含完整 `env` 和可选参数的真实配置示例 |

---

## 六、各平台配置修正方案

### Hermes ✅ (基本正确，需补充 env)

```yaml
# ~/.hermes/config.yaml
mcp_servers:
  agent-search:
    command: npx
    args: ['-y', 'agent-search-mcp']
    env:
      BRAVE_API_KEY: '${BRAVE_API_KEY}'
      TAVILY_API_KEY: '${TAVILY_API_KEY}'
      LOG_LEVEL: 'info'
```

### Claude Code ✅ (基本正确，需补充 env)

```json
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["-y", "agent-search-mcp"],
      "env": {
        "BRAVE_API_KEY": "BSA...",
        "TAVILY_API_KEY": "tvly-...",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Cursor ✅ (基本正确，需补充 env 和全局配置)

```json
// .cursor/mcp.json (项目级) 或 ~/.cursor/mcp.json (全局)
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["-y", "agent-search-mcp"],
      "env": {
        "BRAVE_API_KEY": "BSA...",
        "TAVILY_API_KEY": "tvly-..."
      }
    }
  }
}
```

### Windsurf ❌ (需要修正配置路径)

```json
// ~/.codeium/windsurf/mcp_config.json (全局)
// 或 .windsurf/mcp_config.json (项目级)
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["-y", "agent-search-mcp"],
      "env": {
        "BRAVE_API_KEY": "BSA...",
        "TAVILY_API_KEY": "tvly-..."
      }
    }
  }
}
```

### OpenClaw ❌ (需要补充)

```yaml
# ~/.openclaw/config.yaml (格式待确认)
mcp_servers:
  agent-search:
    command: npx
    args: ['-y', 'agent-search-mcp']
    env:
      BRAVE_API_KEY: '...'
      TAVILY_API_KEY: '...'
```

---

## 七、总结

### 做对了的 ✅
1. **标准 MCP stdio 协议** — 这是多平台兼容性的正确基础，所有主流 MCP 客户端都支持
2. **`npx` 一键安装** — 降低安装门槛，符合 MCP 生态最佳实践
3. **渐进式工具设计** — Exa 模式是产品设计的亮点
4. **统一配置模式** — `command: npx + args: ["agent-search-mcp"]` 在各平台间基本通用

### 需要修复的 ❌
1. **Windsurf 配置路径写错** — 必须立即修正
2. **OpenClaw 配置完全缺失** — 必须补充
3. **`env` 字段从未出现** — 所有平台配置示例都需要补充环境变量传递方式
4. **文档碎片化严重** — 7+ 份文档有设计矛盾，需要合并统一
5. **缺少统一 README** — 用户无法一站式获取完整信息
6. **`free_search_advanced` 参数未锁定** — 跨文档不一致

### 一句话结论
> 多平台兼容性设计在**协议层正确**（标准 MCP stdio），但**配置层存在错误和缺失**（Windsurf 路径错误、OpenClaw 缺失、env 字段遗漏），且**文档层碎片化严重**。修正这些缺陷后，核心的多平台兼容性方案是可靠的。
