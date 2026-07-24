---
type: HandoverDoc
title: agent-search-mcp HANDOVER
timestamp: '2026-07-25T04:30:00+08:00'
description: 会话日志和项目状态
tags:
- agent-search-mcp
- handoverdoc
---
# Agent Search MCP — Handover

## 项目状态

**版本**: npm v3.1.3；main 含 v3.3.0 候选功能，尚未发布
**引擎**: 12 个适配器；当前 `free_search`/CLI 统一路由 8 个
**测试**: vitest — 498 passed, 43 test files
**最后更新**: 2026-07-25
**npm**: https://www.npmjs.com/package/agent-search-mcp
**Python 依赖**: 可选（DDG 自动回退到 cheerio HTML 引擎；语义层需 `pip install model2vec`）

## 最近活动

- [2026-07-25] ✅ Node 18 兼容：Cheerio 固定到 1.0.0；HTTP 关闭时主动清理 keep-alive 空闲连接
- [2026-07-25] ✅ CI 分层：Node 18/20/22 各自 build/test；Node 22 独立执行 lint/typecheck，矩阵不再 fail-fast
- [2026-07-25] ✅ 产品加固：DDG HTML fallback、stdio 日志隔离、CSDN SSRF 防护、Windows 构建
- [2026-07-25] ✅ 市场口径校准：竞品对比改为能力矩阵，历史 benchmark 标为探索性，新增推广素材包
- [2026-07-24] ✅ P2 语义层：Model2Vec 语义去重 + 语义重排（SEMANTIC_DEDUP/SEMANTIC_RERANK，默认 off）
- [2026-07-24] ✅ P0 渐进披露 + 置信度过滤（MAX_FULL_RESULTS/MIN_CONFIDENCE，compact 模式）
- [2026-07-22] ✅ v3.1.1: Streamable HTTP + Capabilities 声明 + MCP annotations + EngineError + DDG News HTML 回退

## 技术决策

- **Python 首选 + HTML 回退**：ddgs 对接 DDG 内部 API 更稳定，HTML 仅在 Python 不可用时回退
- **cheerio 而非 regex**：DDG HTML 结构复杂，cheerio 更健壮，3 个纯 JS 依赖
- **POST 而非 GET**：DDG 搜索表单用 POST，GET 更容易被限流

## 下一步方向

详见路线图: [docs/superpowers/plans/2026-07-22-iteration-roadmap.md](docs/superpowers/plans/2026-07-22-iteration-roadmap.md)

**已完成 (v3.1.1)**: A1/A2/A3 + C1 + D1/D2/D3 + B1/B2 — 全部绿色 ✅

**下一阶段**:

1. 统一 Wikipedia/Startpage/Yandex/Mojeek 在 MCP、CLI、瀑布模式中的路由（涉及 MCP enum，实施前确认兼容方案）
2. Benchmark v3：冻结结果 fixture、真实 engine telemetry、进程内 tokenizer、人工相关性标签
3. 将 confidence/relevance 与独立来源数拆分，修正 `min_confidence` 契约
4. 合并加固分支后发布已重写的掘金文章和短帖素材

## 已知限制

- **DDG HTML 限流**：POST 大量请求触发 HTTP 202，Python 路径不受此限制
- **无分页**：所有引擎目前只返回第一页结果
- **路由未完全统一**：12 个适配器中，Wikipedia/Startpage/Yandex/Mojeek 尚不能从所有 MCP/CLI 入口选择
- **Benchmark 仅作探索**：历史 engine/token 节省比例缺少真实调用遥测与同源 fixture，不应作为发布保证
- **HTTP 暴露面**：HTTP 模式尚未提供认证/Origin 校验；仅应绑定到受信网络或置于认证代理之后
- **依赖审计**：`npm audit` 当前报告 4 项（1 high/1 low 均在 Vitest/Vite 开发链；2 moderate 来自 MCP SDK 的 Hono 传递依赖）。MCP SDK 项暂无非破坏性上游修复，不要为清零审计而降级协议栈。
