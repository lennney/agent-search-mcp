---
type: HandoverDoc
title: agent-search-mcp HANDOVER
timestamp: '2026-07-20T23:35:20+08:00'
description: 会话日志和项目状态
tags:
- agent-search-mcp
- handoverdoc
---
# Agent Search MCP — Handover

## 项目状态

**版本**: v2.2.0
**引擎**: 11 个（ddg/sogou/bing/baidu/brave/tavily/exa/yandex/mojeek/wikipedia/startpage）
**测试**: vitest — 278 passed, 26 test files
**最后更新**: 2026-07-18

## 最近活动

- [2026-07-18] ✅ done: Pulled 10 new commits from origin/main (11 engines, synthesis, Chinese optimizer, engine allowlist, language detector)
- [2026-07-18] ✅ done: Per-engine rate limiting upgrade (free 1.2-1.5s, paid 300-400ms)
- [2026-07-18] ✅ done: LRU cache with TTL + setWithTtl + size/clear/stats API
- [2026-07-18] ✅ done: language-detector bug fix (mixed CJK+Latin priority for 'hello 你好')
- [2026-07-18] ✅ done: Test coverage — rate-limiter (8 tests), cache (13 tests), scorer (14 tests), free-search (8 tests)
