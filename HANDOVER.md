---
type: HandoverDoc
title: agent-search-mcp HANDOVER
timestamp: '2026-07-22T10:45:00+08:00'
description: 会话日志和项目状态
tags:
- agent-search-mcp
- handoverdoc
---
# Agent Search MCP — Handover

## 项目状态

**版本**: v3.1.0（已发布 npm + GitHub Release）
**引擎**: 11 个（ddg/sogou/bing/baidu/brave/tavily/exa/yandex/mojeek/wikipedia/startpage）
**测试**: vitest — 444 passed, 39 test files
**最后更新**: 2026-07-22
**npm**: https://www.npmjs.com/package/agent-search-mcp
**Python 依赖**: 可选（ddgs 不再是硬依赖，DDG 自动回退到 cheerio HTML 引擎）

## 最近活动

- [2026-07-22] ✅ done: Phase A1 `setupFetchTools` 拆分
  - `fetch_github_readme` / `fetch_csdn_article` / `fetch_juejin_article` 现可独立注册
  - `ENABLED_TOOLS` / `DISABLED_TOOLS` 可细粒度控制三个 fetch 工具
  - 保留 `setupFetchTools()` 的原有批量注册行为，保证向后兼容
  - 新增 6 个注册行为测试；总计 444 passed
  - 修复 MCP server、HTTP health 与 capabilities 中滞后的版本元数据

- [2026-07-22] ✅ done: v3.1.0 发布 — npm + GitHub Release
  - DDGS 独立化（Python 可选 + cheerio HTML 回退）
  - 工具可见性控制（ENABLED_TOOLS/DISABLED_TOOLS + ToolPolicy）
  - CLI 版本检查（`fasm --version` + 后台自动检测更新）
  - npm 生态优化（23 keywords, llms.txt, Smithery 配置, badges）
  - 发布流程规范（`docs/release-process.md`）

- [2026-07-22] ✅ done: DDGS 独立化重构 — 8 个 commit，消除 Python 硬依赖
  - 惰性 Python 检测 + `isDdgsAvailable()` 导出
  - 健康报告含 `ddgs_available` 字段
  - `partialFailures` 正确显示引擎名（修复 "unknown" bug）
  - cheerio 原生 DDG HTML 引擎（`src/engines/duckduckgo-html.ts`）
  - Python→HTML 自动回退（`searchDuckDuckGo` 首选 Python，不可用时走 HTML）
  - Dockerfile 去掉 python3 + pip + ddgs
  - 文档全面更新（README/README_zh/AGENTS.md/CHANGELOG.md）

## 技术决策

- **Python 首选 + HTML 回退**：ddgs 对接 DDG 内部 API（更稳定），HTML 解析易受前端改版影响。保留 Python 路径作为首选，HTML 仅在 Python 不可用时回退
- **cheerio 而非 regex**：DDG HTML 结构比 Bing/Sogou 复杂（嵌套结构 + redirect URL），cheerio 更健壮。cheerio ≈ 3 个纯 JS 依赖，比 Python+ddgs 轻得多
- **POST 而非 GET**：DDG 自己的搜索表单用 POST，ddgs/searxng/gajae-code 均用 POST。GET 方式更容易被限流

## 下一步方向

详见完整路线图: [docs/superpowers/plans/2026-07-22-iteration-roadmap.md](docs/superpowers/plans/2026-07-22-iteration-roadmap.md)

### High Priority
1. **Phase A2: MCP Tool annotations** — `readOnlyHint` 标准字段替代纯文本 `@readOnly`
2. **Phase A3: 错误区分度提升** — 引擎错误返回结构化类型 (timeout/4xx/5xx/rate_limited)
3. **Phase C1: DDG News HTML 回退** — `searchDuckduckgoNews()` 无 Python 时用 cheerio 回退
4. **Phase D1: Brave/Tavily mock 测试** — mock fetch 覆盖付费引擎路径

### Medium Priority
6. **Phase D2: free-extract SSRF 安全测试** — 对抗性 URL 输入验证
7. **Phase C2: lite.duckduckgo.com 第三层回退** — 当 html.ddg 限流时的救火队
8. **O1: awesome-mcp-servers PR** — 最大 MCP 目录站收录

### On-going
9. **分发推广** — 掘金文章、V2EX、reddit r/mcp

## 已知限制

- **DDG HTML 限流**：POST 方式在短时间内大量请求会触发 HTTP 202（限流）。UA 轮换有帮助但无法完全避免。Python 路径不受此限制
- **DDG News 无 HTML 回退**：News 搜索仅支持 Python 路径
- **无分页**：所有引擎目前只返回第一页结果
