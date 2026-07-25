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
**引擎**: 12 个适配器；`free_search`/`free_search_advanced`/CLI/瀑布模式已全部统一路由
**测试**: vitest — 510 passed, 43 test files
**最后更新**: 2026-07-25
**npm**: https://www.npmjs.com/package/agent-search-mcp
**Python 依赖**: 可选（DDG 自动回退到 cheerio HTML 引擎；语义层需 `pip install model2vec`）

## 最近活动

- [2026-07-25] ✅ 宣传层级定稿：“免费 + 省 Token”作为第一卖点，“Agent 搜索路由器”作为独特机制和长期路线
- [2026-07-25] ✅ 统一 12 适配器路由，拆分 relevance/confidence/source_count 契约
- [2026-07-25] ✅ Benchmark v3：真实执行遥测、冻结 fixture、锁定 tokenizer 与 CI 回归门禁
- [2026-07-25] ✅ HTTP Bearer 认证 + Origin allowlist；无认证模式必须显式开启

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

1. 在稳定网络 runner 上捕获非空真实 fixture，并补人工相关性标签
2. 在真实反向代理环境验收 Bearer 密钥轮换、Origin 策略和限流
3. 合并加固分支后，按“Agent 搜索路由器”独特路线发布掘金文章和短帖素材

## 已知限制

- **DDG HTML 限流**：POST 大量请求触发 HTTP 202，Python 路径不受此限制
- **无分页**：所有引擎目前只返回第一页结果
- **Benchmark 边界**：冻结 fixture 只验证格式和 token 回归，暂无人工相关性标签；历史精确数字必须带当时查询集/环境限定
- **HTTP 部署**：已有 Bearer/Origin 防护，但生产环境仍需 TLS、密钥轮换和反向代理限流
- **依赖审计**：本次安装报告 5 项（1 low / 2 moderate / 2 high）；当前 runner 访问 npm audit endpoint 被 EACCES 拦截，未能刷新 advisory 明细。不要为清零审计而盲目降级 MCP/测试协议栈。
