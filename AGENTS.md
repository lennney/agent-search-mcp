---
type: AgentInstruction
title: Agent Search MCP — 多引擎统一搜索 MCP Server
timestamp: '2026-07-20T23:35:20+08:00'
description: 7 引擎搜索，MCP 协议接入，免费 + 多源验证 + Token 优化
tags:
- agent-search-mcp
- agentinstruction
---
# Agent Search MCP — 多引擎统一搜索 MCP Server

一句话：11 引擎搜索（ddg/sogou/bing/baidu/brave/tavily/exa/wikipedia/startpage/yandex/mojeek），MCP 协议接入，**免费 + 多源验证 + Token 优化**。

## 当前阶段

**版本**: v3.1.0（已发布 npm + GitHub Release）— [查看完整路线图](docs/superpowers/plans/2026-07-22-iteration-roadmap.md)

**测试**: 438 passed, 38 files | **引擎**: 11 (8 免费, 3 付费) | **Python**: 可选（DDG 自动 HTML 回退）

当前优先事项：
1. **Phase A: Agent UX** — `setupFetchTools` 拆分、MCP annotations、错误区分度
2. **Phase C: 性能** — DDG News HTML 回退、lite.ddg 第三层回退
3. **Phase D: 测试** — brave/tavily mock、E2E 集成测试、SSRF 安全测试
4. **分发推广** — awesome-mcp-servers PR、掘金文章（持续）

## 常用命令

```bash
npm run build                              # 编译 TypeScript
npm test                                   # 跑测试（vitest）
npm run dev                                # 本地运行（stdio 模式）
npm run dev:http                           # HTTP 模式（端口 3000）
npm run dev:both                           # stdio + HTTP 同时
fasm search "query"                         # CLI 搜索
fasm extract "https://..."                  # CLI 提取
```

## 技术栈

- **运行时/语言**: Node.js ≥18 + TypeScript (ESM)
- **MCP 框架**: @modelcontextprotocol/sdk ^1.29.0
- **验证**: zod
- **日志**: pino
- **测试**: vitest
- **包管理**: npm
- **DDG 回退**: cheerio (纯 JS HTML 解析)
- **Python (可选)**: ddgs (DuckDuckGo 后端，子进程调用)

## 技术判断

**形态**: MCP Server（stdio/HTTP 双模式）+ CLI (`fasm`)。
**核心**: 多源搜索聚合、置信度评分、瀑布搜索、内容丰富化、查询扩展。
**免费引擎**: ddg/sogou/bing/baidu/wikipedia/startpage/yandex/mojeek。
**付费**: brave/tavily/exa（可选 fallback）。

## 架构

`src/` 下按职责分层：`tools/`（MCP 工具定义）、`engines/`（11 引擎适配）、`aggregation/`（评分/去重/丰富）、`synthesis/`（结果合成）、`infrastructure/`（安全/缓存/限速）。Agent 自己探索 `src/` 目录获取最新结构。

## 编码规范

详细规范见 `docs/conventions.md`。关键点：
1. 文件/函数 snake_case，类/类型 PascalCase
2. 每个引擎独立文件 `src/engines/{name}.ts`
3. 每个 MCP 工具独立文件 `src/tools/{name}.ts`

## 约束

1. 引擎失败自动 fallback，不中断
2. 搜索质量第一，引擎覆盖第二
3. npm publish 前切 official registry（registry.npmjs.org）
4. 包名: `agent-search-mcp`（npm）/ `free-agent-search-mcp`（AGENTS.md 标注）
5. 不改现有工具接口签名（向后兼容）
6. **版本号克制**: 不频繁发版。只有真正的新功能/修复才 bump。小文档改动、CI 调整不触发版本号变更。每周最多 1 次 publish。patch 版本只留给 bugfix。

## 文档规范

每次功能变更后更新 `CHANGELOG.md` / `README.md` / 功能文档。
重大架构决策写 ADR 到 `docs/decisions/`。

## 测试要求

vitest，`tests/` 按功能目录组织。公共函数 + 新功能必须有测试。

## 边界

- ✅ Always: 跑测试、更新 CHANGELOG、build 通过、更新文档
- ⚠️ Ask: 加新引擎、改 MCP 协议接口、改包名、加重大依赖、改架构分层
- 🚫 Never: 硬编码 API key、删引擎 fallback 逻辑、改 stdio 协议、删测试

## 已知陷阱

- **Bing/Baidu 测试**: 实际搜索需要网络，单测用 mock 模拟 HTTP 响应
- **ddgs 依赖**: Python 库 `ddgs` 为可选依赖。未安装时 DDG 引擎自动回退到 Node.js HTML 引擎（cheerio 解析）。Docker 镜像不含 Python，仅使用 HTML 引擎。`isDdgsAvailable()` 检测可用性，结果缓存在进程生命周期内
- **cheerio 依赖**: DuckDuckGo HTML 引擎依赖 cheerio（纯 JS，无 native binding），npm install 自动安装
- **中文搜索**: Sogou + Baidu 专供中文搜索，不要用 Google Translate 翻译替代
- **请求合并**: 相同查询在 100ms 内自动合并，避免并发重复请求
- **Env 变量**: API key 通过环境变量传入，不走配置文件
- **npm publish**: 当前 registry 是腾讯镜像（mirrors.tencentyun.com），publish 前必须切到 registry.npmjs.org
- **工具可见性**: `ENABLED_TOOLS` / `DISABLED_TOOLS` 环境变量控制 MCP 工具注册。`DISABLED_TOOLS` 优先级高于 `ENABLED_TOOLS`。默认全部启用。资源（capabilities/health）不受此策略影响。

## 文档索引

`docs/conventions.md` — 编码规范  |  `docs/plans/` — 功能计划  |  `docs/decisions/` — ADR

## Agent 规则

- **修改代码前**: 先读此 AGENTS.md + HANDOVER.md + docs/conventions.md
- **增加功能**: 新增引擎 → 改 engines/ + 注册；新增工具 → 改 tools/ + 注册
- **完成变更后**: 更新 CHANGELOG + README + HANDOVER
- **踩到新坑**: 更新 AGENTS.md "已知陷阱" 或写 LEARNINGS.md
- **重大决策**: 写 ADR 到 docs/decisions/
- **commit 格式**: `type: 简短描述`（类型: feat/fix/docs/chore/revert）
