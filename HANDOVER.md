---
type: HandoverDoc
title: agent-search-mcp HANDOVER
timestamp: '2026-07-25T04:30:00+08:00'
description: 会话日志和项目状态
tags:
- agent-search-mcp
- handoverdoc
---

## 2026-07-26 multi-system review-pool handover

- Added a deterministic pool contract for two or more traced captures of the
  same query set. It rejects trace tampering, duplicate system IDs, and query
  metadata drift.
- Canonical URL deduplication keeps protected per-system ranks and result
  hashes while reviewer packets hide system/rank/internal provenance.
- A reviewer slot is no longer treated as human identity. Completed packets
  require distinct human reviewer IDs and timestamps.
- Review import retains both judgments, exposes agreements/disagreements, and
  refuses completed status until every candidate has a final judgment and a
  named human adjudicator.
- Completed adjudication can now produce a per-system comparison that
  reconstructs protected original rankings. Recall is pool-relative; answer
  accuracy and tokens per correct answer stay explicitly unmeasured.
- Adjudication now records reviewer reliability before final labels: raw
  agreement, ordinal weighted kappa, binary citation kappa, and defined-pair
  counts. The validator recomputes these values from retained judgments.
- Human verification no longer implies headline eligibility. The comparison
  report requires 30 adjudicated rows and 30 distinct queries overall, plus 10
  rows and 10 distinct queries per reported slice; these are minimum
  guardrails, not a substitute for power/coverage analysis.
- Eligible comparisons now report deterministic query-paired bootstrap 95%
  intervals from 2,000 resamples for every system pair. Deltas are left minus
  right; retrieval uses percentage points and latency uses milliseconds.
  Small samples emit `insufficient-sample` rather than an inferred interval.
- CLI: `node benchmarks/pool.mjs`; workflow and limitations are documented in
  `benchmarks/README.md`.
- This closes the tooling portion only. Still required: capture a genuinely
  independent second system, obtain two human reviews, and adjudicate.
- Evidence: `docs/evidence/2026-07-26-search-pooling-contract.md`.

## 2026-07-26 non-empty reviewer-pipeline handover

- Fixed two core search defects exposed by live qualification: waterfall now
  honors explicit engines, and Wikipedia returns bounded article extracts
  instead of empty snippets that are later filtered out.
- Wikipedia routes CJK queries to `zh.wikipedia.org`.
- Relevance now uses Latin/CJK term coverage, differentiating broad matches
  from one-term partial matches without mixing relevance into confidence.
- Added query-set/engine options to the live runner and checked in a real
  two-query, 20-candidate Wikipedia capture.
- Two blinded reviewer packets omit adapter/ranking provenance, internal
  scores, source counts, traces, and original rank while keeping
  question/reference-answer context and required publisher attribution.
- CI verifies raw-response/source hashes, candidate coverage, data-license
  metadata, opaque IDs, rank hiding, and the `pending-human` gate.
- This is a single-engine pipeline qualification, not a public quality result.
  Remaining gate: multi-system pool, two real human reviews, adjudication.
- Evidence: `docs/evidence/2026-07-26-reviewer-pilot.md`.

## 2026-07-26 P2 MCP HTTP behavior handover

- The remaining experimental HTTP matrix now covers trusted/untrusted CORS,
  Bearer success and failure, W3C trace propagation, real-socket cancellation,
  public tool-list cache hints, and automatic refresh after
  `tools/list_changed`.
- Trace context reaches the experimental search execution boundary and is not
  logged. Treat all W3C headers, especially `baggage`, as untrusted input.
- Redacted raw HTTP evidence is checked in at
  `experiments/mcp-2026/evidence/p2-http-matrix-2026-07-26.json`; volatile
  transport headers are explicitly omitted.
- The capture ran locally on Node `v24.14.1` with SDK v2 `2.0.0-beta.5`.
  Node 20/22 are recorded only as configured CI targets in this capture.
- Reproduction and limitations:
  `docs/evidence/mcp-2026-p2-http-matrix.md`.
- Remaining release gates are official 2026 HTTP/stdio conformance, final SDK
  replacement, and an evidence-backed promotion decision.

## 2026-07-26 P2 MCP routing-header handover

- The experimental Node HTTP edge now inspects `IncomingMessage.rawHeaders`
  and rejects duplicate `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`, and
  arbitrary `Mcp-Param-*` fields before normalization can hide ambiguity.
- A real tool schema with `x-mcp-header` proves case-insensitive header names
  and integer `5.0` versus body `5` canonicalization through SDK v2 beta.5.
- Missing or malformed Base64 parameter headers return SDK
  `HeaderMismatch` (`-32020`) before tool dispatch.
- Reproducible evidence:
  `docs/evidence/mcp-2026-routing-headers.md`.
- Remaining protocol test package: CORS, auth, trace, cache hints,
  cancellation, tool-list changes, and raw trace capture.

## 2026-07-26 P2 search-quality benchmark handover

- Live captures now preserve raw response hashes, latency, requested-engine
  outcomes, and disclosed failures.
- Added a pending-human label workflow and strict `human-verified` gate with
  two distinct human reviewers.
- Quality reports separate graded retrieval, answer correctness, citation
  support, token efficiency, latency, trace coverage, and failure transparency;
  they also include language/category/freshness slices.
- The bootstrap fixture only verifies metric code and sets
  `quality_claim_eligible: false`.
- The real two-query pilot returned zero results after eight zero-key calls per
  query. It remains checked in as failure evidence; do not promote it as search
  quality.
- Added the optional Slim Guard evidence handoff schema and validator without
  modifying Slim Guard or adding a runtime dependency.
- Remaining gate: non-empty pooled capture plus two-reviewer judgments.

## 2026-07-26 P1 query-aware evidence handover

- Scope remains Agent Search only; Slim Guard was not modified.
- Full search results now carry a deterministic, query-aware evidence packet
  with separate provenance, relevance, corroboration, freshness, extraction,
  and passage-selection signals.
- `EVIDENCE_BUDGET_CHARS` defaults to 1200 characters and is clamped to
  200-20000. Response metadata reports the budget, actual use, and truncation.
- Compact placeholders retain `sources`; response-level `partialFailures`
  remains unchanged.
- Stable and experimental 2026 boundaries share the JSON packet shape without
  changing public MCP tool inputs.
- Frozen fixture replay now uses explicit 1200/600/360-character budgets and
  measures 28.4% / 30.4% compact formatting savings.
- Reproducible evidence is in
  `docs/evidence/2026-07-26-evidence-packets.md`.

## 2026-07-26 Agent Search core evidence handover

- Scope was limited to Agent Search. Slim Guard was not modified.
- Added explicit `success` / `skipped` / `failed` engine outcomes. Thrown
  adapter failures now populate `partialFailures` while fallback continues.
- Stable MCP handlers pass their request cancellation signal through search
  orchestration, rate-limit waits, retry delays, HTTP adapters, and enrichment.
  Signalled requests bypass in-flight request sharing so one caller cannot
  cancel another caller's work.
- The experimental SDK v2 tool passes its handler cancellation signal as a
  separate execution context; public search arguments and results remain
  JSON-shaped across the stable-domain boundary.
- Enrichment is confidence-neutral and preserves `source_count`.
- Parallel and waterfall execution now share the same cache key, and waterfall
  reads cached responses before calling engines.
- Direct adapter calls retain their legacy soft-failure behavior. The
  orchestrator opts into thrown errors with `throwOnError` to obtain reliable
  failure evidence without breaking adapter consumers.

## 2026-07-25 P1 experimental MCP 2026 handover

- Added private `experiments/mcp-2026` package: Node.js 20+, exact SDK v2
  beta.5 pins, separate lockfile, and no changes to the stable Node.js 18+
  runtime dependencies.
- HTTP and stdio explicitly negotiate `2026-07-28`; the same factory continues
  to serve a `2025-11-25` legacy client.
- Only JSON-shaped search inputs/results cross into the stable
  `searchWithFallback` implementation. No SDK v1 object crosses the boundary.
- Experimental tests: 14 passed across 4 files, including real HTTP and stdio
  transports, modern/legacy negotiation, structured results, fallback, and
  routing-header validation.
- `@modelcontextprotocol/conformance@0.1.16` `server-initialize` passed 1/1.
  That release only lists scenarios through `2025-11-25`, so full 2026
  conformance remains a P2 release gate.
- POST bodies require a valid `Content-Length`; chunked transfer encoding is
  rejected so `HTTP_MAX_BODY_BYTES` cannot be bypassed.
- Remaining P2 work: the broader CORS/auth/trace/cache/cancellation/tool-list
  matrix, raw traces, and the official 2026 conformance scenarios once
  published.
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
**测试**: vitest — 515 passed, 44 test files
**最后更新**: 2026-07-26
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
