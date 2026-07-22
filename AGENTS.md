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

```
src/
├── index.ts                       # 入口 + 工具注册编排
├── types.ts                       # 核心类型 (SearchResult, SearchProvider)
├── cli.ts                         # CLI 入口 (fasm)
│
├── tools/                         # MCP 工具定义
│   ├── free-search.ts             #   基础搜索 + 瀑布流程 + 编排
│   ├── free-search-advanced.ts    #   高级搜索（过滤 + 瀑布 + 丰富）
│   ├── free-search-news.ts        #   新闻搜索
│   ├── search-with-synthesis.ts   #   深度搜索 + prompt_hint
│   ├── free-extract.ts            #   页面提取 (Jina Reader)
│   ├── fetch-tools.ts             #   GitHub/CSDN/Juejin 提取
│   ├── capabilities.ts            #   能力披露资源
│   └── health.ts                  #   健康检查 + 指标
│
├── engines/                       # 搜索引擎适配（每引擎独立文件）
│   ├── duckduckgo.ts              #   免费 — Python ddgs 首选 / cheerio 回退
│   ├── duckduckgo-html.ts         #   免费 — cheerio HTML 引擎（自动回退）
│   ├── sogou.ts                   #   免费
│   ├── bing.ts                    #   免费
│   ├── baidu.ts                   #   免费
│   ├── wikipedia.ts               #   免费
│   ├── startpage.ts               #   免费
│   ├── yandex.ts                  #   免费
│   ├── mojeek.ts                  #   免费
│   ├── brave.ts                   #   付费
│   ├── tavily.ts                  #   付费
│   ├── exa.ts                     #   付费
│   └── index.ts                   #   引擎桶导出
│
├── aggregation/                   # 搜索聚合层
│   ├── scorer.ts                  #   评分 + 置信度 + 域名权威
│   ├── dedup.ts                   #   去重 (URL + 标题)
│   ├── format.ts                  #   格式化输出
│   ├── enricher.ts                #   内容提取丰富 (Jina Reader)
│   ├── query-expander.ts          #   查询扩展
│   ├── language-detector.ts       #   语言自动检测
│   ├── chinese-optimizer.ts       #   中文优化（繁简转换、停用词）
│   └── index.ts                   #   桶导出
│
├── synthesis/                     # 搜索结果合成
│   ├── index.ts                   #   合成编排
│   └── prompt-builder.ts          #   prompt_hint 构建
│
├── infrastructure/                # 基础设施
│   ├── config.ts                  #   配置读取 (env vars)
│   ├── cache.ts                   #   LRU 缓存
│   ├── rate-limiter.ts            #   逐引擎限速
│   ├── health.ts                  #   健康追踪 + 指标
│   ├── security.ts                #   注入检测 + 边界标记
│   ├── url-validator.ts           #   SSRF 保护
│   ├── tool-policy.ts             #   工具可见性控制 (allow/deny)
│   ├── version-check.ts           #   npm 版本检查
│   ├── html-utils.ts              #   HTML 解析工具
│   ├── http.ts                    #   HTTP 服务 (HTTP+SSE mode)
│   └── logger.ts                  #   日志 (pino)
```

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
