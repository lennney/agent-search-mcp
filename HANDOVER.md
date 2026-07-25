---
type: HandoverDoc
title: agent-search-mcp HANDOVER
timestamp: '2026-07-25T04:30:00+08:00'
description: 会话日志和项目状态
tags:
- agent-search-mcp
- handoverdoc
---

## 2026-07-25 P1 experimental MCP 2026 handover

- Added private `experiments/mcp-2026` package: Node.js 20+, exact SDK v2
  beta.5 pins, separate lockfile, and no changes to the stable Node.js 18+
  runtime dependencies.
- HTTP and stdio explicitly negotiate `2026-07-28`; the same factory continues
  to serve a `2025-11-25` legacy client.
- Only JSON-shaped search inputs/results cross into the stable
  `searchWithFallback` implementation. No SDK v1 object crosses the boundary.
- Experimental tests: 9 passed across 3 files, including real HTTP and stdio
  transports, modern/legacy negotiation, structured results, and routing
  mismatch rejection.
- `@modelcontextprotocol/conformance@0.1.16` `server-initialize` passed 1/1.
  That release only lists scenarios through `2025-11-25`, so full 2026
  conformance remains a P2 release gate.
- POST bodies require a valid `Content-Length`; chunked transfer encoding is
  rejected so `HTTP_MAX_BODY_BYTES` cannot be bypassed.
- Known P2 work: `Mcp-Param-*` edge cases, automatic fallback to the production
  entry, and the official 2026 conformance scenarios once published.
- Residual audit note: SDK v2 beta.5 brings `@hono/node-server@1.19.15`, whose
  advisory affects Windows static-file serving. This entry does not use that
  feature; do not force a major transitive override.
- Hermes work was intentionally deferred; the Git plan remains authoritative.

## 2026-07-25 P2 fallback and CI handover

- SDK v2 beta.5 `auto` mode now falls back to the real stable server over both
  HTTP and stdio, negotiating `2025-11-25` and preserving `free_search`.
- The fallback test exposed a production HTTP bug: one stateless SDK v1
  transport was reused across requests, so `notifications/initialized`
  returned an empty HTTP 500.
- Stable server composition now lives in `src/server.ts`; stdio creates one
  long-lived instance, while stateless HTTP creates a server plus Web Standard
  transport per request.
- `.github/workflows/ci.yml` runs the isolated 2026 suite on Node 20 and 22.
- Evidence and exact reproduction commands:
  `docs/evidence/mcp-2026-p2-fallback.md`.
- Test totals: stable 515/44; experimental 11/4.

# Agent Search MCP — Handover

## 项目状态

**版本**: npm v3.1.3；main 含 v3.3.0 候选功能，尚未发布
**引擎**: 12 个适配器；`free_search`/`free_search_advanced`/CLI/瀑布模式已全部统一路由
**测试**: vitest — 514 passed, 44 test files
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

## 2026-07-25 补充交接

- 修复 `search_with_synthesis`：`confidence` 统一为 0-1，
  `min_source_count` 独立表达多源验证；兼容旧的 2-3 输入。
- 合成结果现在保留每条结果自己的来源，不再把所有结果标成首个搜索引擎。
- `/health` 明确区分稳定协议 `2025-11-25` 与实验目标
  `2026-07-28`；CORS 已放行新路由头和 W3C Trace Context。
- 完整 2026 协议需要 SDK v2 和 Node 20+，当前只做双轨准备，未宣称生产兼容。
- 新路线图：
  `docs/plans/2026-07-25-mcp-ecosystem-and-2026-readiness.md`。
- 新 ADR：Git 中的 ADR/Plan 是唯一权威源；腾讯 Hermes 只保存带 commit/path
  的可搜索投影。SSH 检查时 `tencent` 主机主动关闭连接，尚未创建远端目录或任务。
