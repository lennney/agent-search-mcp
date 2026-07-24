---
type: HandoverDoc
title: agent-search-mcp HANDOVER
timestamp: '2026-07-24T09:10:00+08:00'
description: 会话日志和项目状态
tags:
- agent-search-mcp
- handoverdoc
---
# Agent Search MCP — Handover

## 项目状态

**版本**: v3.1.1（已发布 npm + GitHub Release）
**引擎**: 11 个（ddg/sogou/bing/baidu/brave/tavily/exa/yandex/mojeek/wikipedia/startpage）
**测试**: vitest — 448 passed, 40 test files
**最后更新**: 2026-07-22
**npm**: https://www.npmjs.com/package/agent-search-mcp
**Python 依赖**: 可选（DDG 自动回退到 cheerio HTML 引擎）

## 最近活动

- [2026-07-22] ✅ v3.1.1: Streamable HTTP + Capabilities 声明 + MCP annotations + EngineError + DDG News HTML 回退 + E2E 集成测试 (4 tests)
- [2026-07-22] ✅ setupFetchTools 拆分：3 个 fetch 工具可独立注册/禁用
- [2026-07-22] ✅ v3.1.0 发布：DDGS 独立化 + 工具可见性控制 + CLI 版本检查 + npm 生态优化
- [2026-07-22] ✅ DDGS 独立化重构：Python 可选 + cheerio HTML 引擎 + Docker 去 Python

## 技术决策

- **Python 首选 + HTML 回退**：ddgs 对接 DDG 内部 API 更稳定，HTML 仅在 Python 不可用时回退
- **cheerio 而非 regex**：DDG HTML 结构复杂，cheerio 更健壮，3 个纯 JS 依赖
- **POST 而非 GET**：DDG 搜索表单用 POST，GET 更容易被限流

## 下一步方向

详见路线图: [docs/superpowers/plans/2026-07-22-iteration-roadmap.md](docs/superpowers/plans/2026-07-22-iteration-roadmap.md)

**已完成 (v3.1.1)**: A1/A2/A3 + C1 + D1/D2/D3 + B1/B2 — 全部绿色 ✅

**下一阶段 (v3.2.0+)**: C2 第三层回退 / C3 引擎惰性加载 / O1 awesome-mcp-servers PR / O2 掘金文章

## 已知限制

- **DDG HTML 限流**：POST 大量请求触发 HTTP 202，Python 路径不受此限制
- **DDG News 无 HTML 回退**：News 搜索仅支持 Python 路径
- **无分页**：所有引擎目前只返回第一页结果
