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

v3.0.1 — 稳定迭代期。Synthesis Engine、News Search、8 免费引擎、语言自动检测已落地。

当前优先事项：
1. **Geo 推广** — 掘金/V2EX/gh.l-web 中文内容上线，占中文开发者流量
2. **目录站分发** — 完善 Glama/mcp.directory/awesome-mcp-servers 收录
3. **Agent 自然传播** — capabilities 资源 + tool description 让 agent 发现项目信息
4. **npm publish** — 下个版本发布前更新 CHANGELOG + 切 official registry（版本号克制）

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
- **MCP 框架**: @modelcontextprotocol/sdk ^1.11.2
- **验证**: zod
- **日志**: pino
- **测试**: vitest
- **包管理**: npm
- **Python 依赖**: ddgs (DuckDuckGo 后端，子进程调用)

## 技术判断

**形态**: MCP Server（stdio/HTTP 双模式）+ CLI (`fasm`)。  
**核心**: 多源搜索聚合、置信度评分、瀑布搜索、内容丰富化、查询扩展。  
**免费引擎**: ddg/sogou/bing/baidu。**付费**: brave/tavily/exa（可选 fallback）。

## 架构

```
src/
├── index.ts                  # 入口
├── types.ts                  # 核心类型
├── cli.ts                    # CLI 入口 (fasm)
├── tools/                    # MCP 工具定义
│   ├── free-search.ts        #   基础搜索 + 瀑布流程 + 编排
│   ├── free-search-advanced.ts # 高级搜索（过滤 + 瀑布 + 丰富）
│   ├── free-extract.ts       #   页面提取
│   ├── fetch-tools.ts        #   GitHub/CSDN/Juejin 提取
│   ├── capabilities.ts       #   能力披露资源
│   └── health.ts             #   健康检查资源
├── engines/                  # 搜索引擎适配
│   ├── duckduckgo.ts         #   免费
│   ├── sogou.ts              #   免费
│   ├── bing.ts               #   免费
│   ├── baidu.ts              #   免费
│   ├── brave.ts              #   付费
│   ├── tavily.ts             #   付费
│   └── exa.ts                #   付费
├── aggregation/              # 搜索聚合层
│   ├── scorer.ts             #   评分 + 置信度 + 域名权威
│   ├── dedup.ts              #   去重
│   ├── format.ts             #   格式化输出
│   ├── enricher.ts           #   内容提取丰富 (Jina Reader)
│   ├── query-expander.ts     #   查询扩展
│   └── index.ts              #   桶导出
└── infrastructure/           # 基础设施
    ├── config.ts             #   配置
    ├── cache.ts              #   缓存 (LRU)
    ├── rate-limiter.ts       #   限速
    ├── health.ts             #   健康追踪
    ├── security.ts           #   注入检测 + 边界标记
    ├── url-validator.ts      #   SSRF 保护
    ├── html-utils.ts         #   HTML 解析
    ├── http.ts               #   HTTP 服务
    └── logger.ts             #   日志
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
- **ddgs 依赖**: Python 库 `ddgs` 必须 pip 安装，构建时不会自动装
- **中文搜索**: Sogou + Baidu 专供中文搜索，不要用 Google Translate 翻译替代
- **请求合并**: 相同查询在 100ms 内自动合并，避免并发重复请求
- **Env 变量**: API key 通过环境变量传入，不走配置文件
- **npm publish**: 当前 registry 是腾讯镜像（mirrors.tencentyun.com），publish 前必须切到 registry.npmjs.org

## 文档索引

`docs/conventions.md` — 编码规范  |  `docs/plans/` — 功能计划  |  `docs/decisions/` — ADR

## Agent 规则

- **修改代码前**: 先读此 AGENTS.md + HANDOVER.md + docs/conventions.md
- **增加功能**: 新增引擎 → 改 engines/ + 注册；新增工具 → 改 tools/ + 注册
- **完成变更后**: 更新 CHANGELOG + README + HANDOVER
- **踩到新坑**: 更新 AGENTS.md "已知陷阱" 或写 LEARNINGS.md
- **重大决策**: 写 ADR 到 docs/decisions/
- **commit 格式**: `type: 简短描述`（类型: feat/fix/docs/chore/revert）
