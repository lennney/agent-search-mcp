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

- [2026-07-22] ✅ done: DDGS 独立化重构 — 8 个 commit，消除 Python 硬依赖
  - 惰性 Python 检测 + `isDdgsAvailable()` 导出
  - 健康报告含 `ddgs_available` 字段
  - `partialFailures` 正确显示引擎名（修复 "unknown" bug）
  - cheerio 原生 DDG HTML 引擎（`src/engines/duckduckgo-html.ts`）
  - Python→HTML 自动回退（`searchDuckDuckGo` 首选 Python，不可用时走 HTML）
  - Dockerfile 去掉 python3 + pip + ddgs
  - 文档全面更新（README/README_zh/AGENTS.md/CHANGELOG.md）

- [2026-07-22] ✅ done: DDG HTML 引擎 bug 修复 — 2 个 commit
  - protocol-relative URL 解析（`//duckduckgo.com/l/?uddg=...` → 真实 URL）
  - 广告过滤（`result--ad` class）

- [2026-07-22] ✅ done: 参照 ddgs 源码改进 — 1 个 commit
  - GET → POST（ddgs 模式，form-encoded body）
  - UA 轮换（4 个 User-Agent）
  - HTTP 202 限流检测 + captcha 页面检测
  - 更严格的 URL 过滤（拒绝 `duckduckgo.com/y.js` 广告链接）

## 技术决策

- **Python 首选 + HTML 回退**：ddgs 对接 DDG 内部 API（更稳定），HTML 解析易受前端改版影响。保留 Python 路径作为首选，HTML 仅在 Python 不可用时回退
- **cheerio 而非 regex**：DDG HTML 结构比 Bing/Sogou 复杂（嵌套结构 + redirect URL），cheerio 更健壮。cheerio ≈ 3 个纯 JS 依赖，比 Python+ddgs 轻得多
- **POST 而非 GET**：DDG 自己的搜索表单用 POST，ddgs/searxng/gajae-code 均用 POST。GET 方式更容易被限流

## 下一步方向

### 高优先级
1. **`lite.duckduckgo.com/lite/` 第二回退** — 当 `html.duckduckgo.com` 被封时，lite 端点使用不同的 HTML 结构（`result-link` / `result-snippet` class），可作为第三层回退
2. **DDG News HTML 回退** — 目前 `searchDuckduckgoNews()` 无 Python 时返回空数组，可参照 `https://duckduckgo.com/news` HTML 结构实现回退
3. **分页支持** — DDG HTML 支持 "Next page" 但需要 `vqd` token（从 page 1 的 `<input name="vqd">` 提取）。ddgs 的分页实际已坏（只发 `s` offset 不发 `vqd`），需要正确实现

### 中优先级
4. **TLS 指纹随机化** — ddgs 用 `primp`（Rust curl-impersonate）+ 随机 TLS cipher suites + HTTP/2 settings 随机化。Node.js 可用 `undici` 自定义 cipher 或 `curl-impersonate` shell-out
5. **npm publish** — 当前版本 v3.0.1，CHANGELOG 已准备好。publish 前需切到 registry.npmjs.org（当前是腾讯镜像）
6. **测试覆盖** — DDG HTML 引擎真实网络测试（目前只测 mock，可加 integration test 标记 skip on no-network）

### 低优先级
7. **DDG HTML 结构监控** — 添加健康检查脚本，定期验证 DDG HTML 结构未改版（cheerio 选择器仍匹配）
8. **Geo 推广** — 掘金/V2EX 中文内容上线，Glama/mcp.directory 目录站收录

## 已知限制

- **DDG HTML 限流**：POST 方式在短时间内大量请求会触发 HTTP 202（限流）。UA 轮换有帮助但无法完全避免。Python 路径不受此限制
- **DDG News 无 HTML 回退**：News 搜索仅支持 Python 路径
- **无分页**：所有引擎目前只返回第一页结果
