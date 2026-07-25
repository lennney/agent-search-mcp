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

一句话：12 个搜索适配器（8 个零密钥 + 4 个可选 API），MCP 协议接入，**中文原生 + 多源聚合 + Token 可控**。

## 当前阶段

**版本**: v3.1.0（已发布 npm + GitHub Release）— [查看完整路线图](docs/superpowers/plans/2026-07-22-iteration-roadmap.md)

**测试**: stable 556 passed, 50 files; experimental 2026 21 passed, 7 files | **适配器**: 12（8 零密钥, 4 可选 API）| **Python**: 可选（DDG 自动 HTML 回退）

当前优先事项：
1. **搜索质量证据** — 在稳定网络 runner 上捕获真实 fixture 并增加人工相关性标签
2. **HTTP 部署指南** — Bearer 密钥轮换、Origin allowlist 与反向代理配置
3. **信号校准** — 用真实失败查询持续校准 relevance/confidence/source_count
4. **分发推广** — 发布已校准口径的掘金/Reddit/V2EX 素材（持续）

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

`src/` 下按职责分层：`tools/`（MCP 工具定义）、`engines/`（12 个引擎适配器）、`aggregation/`（评分/去重/丰富）、`synthesis/`（结果合成）、`infrastructure/`（安全/缓存/限速）。Agent 自己探索 `src/` 目录获取最新结构。

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
- **cheerio 依赖**: DuckDuckGo HTML 引擎依赖 cheerio（纯 JS，无 native binding）。必须固定在 `1.0.0` 以维持 Node 18 支持；Cheerio 1.2+ 要求 Node 20.18.1+
- **中文搜索**: Sogou + Baidu 专供中文搜索，不要用 Google Translate 翻译替代
- **请求合并**: 相同查询在 100ms 内自动合并，避免并发重复请求
- **Env 变量**: API key 通过环境变量传入，不走配置文件
- **npm publish**: 当前 registry 是腾讯镜像（mirrors.tencentyun.com），publish 前必须切到 registry.npmjs.org
- **工具可见性**: `ENABLED_TOOLS` / `DISABLED_TOOLS` 环境变量控制 MCP 工具注册。`DISABLED_TOOLS` 优先级高于 `ENABLED_TOOLS`。默认全部启用。资源（capabilities/health）不受此策略影响。
- **路由能力面**: 12 个适配器已统一进入 MCP / CLI / 瀑布路由；You.com 必须有 `YDC_API_KEY`，不要把“包内存在”与“当前凭证可用”混淆。
- **Benchmark 口径**: 可保留 2026-07-24 历史 30 查询实测的 28.7% / 35.5% / 75%，但必须限定当时查询集和环境。当前冻结 fixture + `gpt-tokenizer` 用于可重现的格式化回归，不代表搜索质量。
- **Evidence budget**: `EVIDENCE_BUDGET_CHARS` 是整个响应共享的 passage 字符预算，不是每条结果的预算；compact 占位结果必须保留 `sources`，缺失发布时间必须返回 `null`，禁止推断。
- **Quality evidence gate**: `quality-bootstrap.json` 只用于指标回归，`quality_claim_eligible=false`；公开质量数字必须来自非空 pooled capture、两名独立人工 reviewer 和 `human-verified` 元数据。零结果样本必须保留用于失败透明度，禁止静默排除。
- **Reviewer pilot**: `live-reviewer-pilot.json` 只是 Wikipedia 单引擎的非空链路验收，不是 multi-system pool 或质量声明；reviewer 包必须移除 adapter/ranking provenance、内部 score/confidence、source_count 和 execution trace，但保留 publisher URL 与必要许可署名。
- **Human review identity**: `reviewer_slot` 只用于盲包排列，不能当作人工身份。completed review 必须填写不同的 human reviewer ID 与完成时间；pool 必须保留各系统原始 rank/hash，reviewer 包必须隐藏这些 provenance。
- **Benchmark data license**: 第三方检索摘要不自动继承仓库 Apache-2.0；提交 capture 前必须核对再分发条款并记录许可/署名。Wikipedia pilot 的 extract 按 CC BY-SA 4.0 单独声明，文章 URL 用于贡献者署名。
- **Waterfall engine contract**: 显式 `engines` 必须过滤每个 waterfall phase 和 paid fallback；不得因固定 phase 偷跑未请求适配器。Wikipedia 使用带 extract 的 MediaWiki query API，CJK 查询路由到中文站。
- **2026 路由头**: experimental Node HTTP 必须从 `rawHeaders` 拒绝重复的 `MCP-Protocol-Version`、`Mcp-Method`、`Mcp-Name` 与任意 `Mcp-Param-*`，避免规范化掩盖歧义；参数值解码和 body 一致性继续交给 SDK v2。
- **2026 HTTP 证据**: W3C trace headers 只传入 search execution context，禁止记录可能含秘密的 `baggage`；取消必须经真实 socket 到达 handler signal；`tools/list_changed` 必须使 SDK 客户端缓存失效。证据捕获只保留安全/协议响应头，并列出被省略的易变传输头。
- **HTTP 安全默认值**: HTTP / both 模式必须配置 `HTTP_AUTH_TOKEN`；只有显式 `HTTP_ALLOW_UNAUTHENTICATED=true` 才允许无认证运行。带 Origin 的浏览器请求必须命中 `ALLOWED_ORIGINS`。
- **stdio 日志**: stdout 只用于 MCP JSON-RPC。运行日志必须走 `logger`（stderr）或 `console.error`，禁止在服务路径使用 `console.log`。
- **失败证据**: 适配器直接调用仍保留空数组软失败兼容；搜索编排器必须传
  `throwOnError`，将真实上游异常记录到 `partialFailures`，不能再把异常当成
  “零结果”。
- **取消隔离**: 带 `AbortSignal` 的请求不得复用全局 pending promise；取消
  必须继续传入限速等待、重试退避、HTTP 适配器和 enrichment。
- **丰富化语义**: Jina/正文提取只能改进 snippet，不能增加 `confidence` 或
  `source_count`；提取不是独立来源佐证。
- **缓存键**: parallel 与 waterfall 必须通过同一个搜索选项键读写缓存。

## 文档索引

`docs/conventions.md` — 编码规范  |  `docs/plans/` — 功能计划  |  `docs/decisions/` — ADR

## Agent 规则

- **修改代码前**: 先读此 AGENTS.md + HANDOVER.md + docs/conventions.md
- **增加功能**: 新增引擎 → 改 engines/ + 注册；新增工具 → 改 tools/ + 注册
- **完成变更后**: 更新 CHANGELOG + README + HANDOVER
- **踩到新坑**: 更新 AGENTS.md "已知陷阱" 或写 LEARNINGS.md
- **重大决策**: 写 ADR 到 docs/decisions/
- **commit 格式**: `type: 简短描述`（类型: feat/fix/docs/chore/revert）
