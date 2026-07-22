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
**测试**: vitest — 438 passed, 38 test files
**最后更新**: 2026-07-22
**npm**: https://www.npmjs.com/package/agent-search-mcp
**Python 依赖**: 可选（ddgs 不再是硬依赖，DDG 自动回退到 cheerio HTML 引擎）

## 最近活动

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

### 高优先级
1. **提 PR 到 awesome-mcp-servers** — 最大的 MCP 集合仓库，每 PR 都是曝光。仓库: `punkpeye/awesome-mcp-servers`
2. **掘金文章** — 中文开发者社区推广，主题 "npm install 即用的免费 MCP 搜索，11 引擎零配置"
3. **`lite.duckduckgo.com/lite/` 第三层回退** — 当 `html.duckduckgo.com` 被封时，lite 端点使用不同的 HTML 结构（`result-link` / `result-snippet` class），可作为第三层回退
4. **DDG News HTML 回退** — 目前 `searchDuckduckgoNews()` 无 Python 时返回空数组，可参照 `https://duckduckgo.com/news` HTML 结构实现回退

### 中优先级
5. **分页支持** — DDG HTML 支持 "Next page" 但需要 `vqd` token
6. **TLS 指纹随机化** — ddgs 用 `primp`（Rust curl-impersonate）+ 随机 TLS cipher suites
7. **测试覆盖** — brave.ts + tavily.ts 测试（mock fetch），free-extract.ts SSRF 安全测试
8. **`setupFetchTools` 拆分** — 当前一个 policy key 控制 3 个 fetch 工具，需拆分为独立注册函数以支持细粒度 ENABLED_TOOLS 控制

### 低优先级
9. **DDG HTML 结构监控** — 定期验证 DDG HTML 选择器未改版
10. **V2EX 发帖** — 中文技术社区二次曝光
11. **验证 Smithery 部署** — 需要 Smithery 账号登录确认

## 已知限制

- **DDG HTML 限流**：POST 方式在短时间内大量请求会触发 HTTP 202（限流）。UA 轮换有帮助但无法完全避免。Python 路径不受此限制
- **DDG News 无 HTML 回退**：News 搜索仅支持 Python 路径
- **无分页**：所有引擎目前只返回第一页结果
