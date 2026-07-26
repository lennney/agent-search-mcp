---
type: HandoverDoc
title: Agent Search MCP handover
timestamp: '2026-07-26T13:55:00+08:00'
description: 当前状态、核心契约和下一步
tags:
- agent-search-mcp
- handover
---

# Agent Search MCP — Handover

## 当前状态

- `package.json` 当前版本为 `3.1.3`；检查点以当前 Git HEAD 为准。
- 稳定产品面是 Node.js >=18、TypeScript ESM、MCP stdio/HTTP 和 `fasm` CLI。
- 12 个适配器均进入统一路由：8 个零密钥，4 个可选 API。
- Slim Guard 是独立产品；本仓库只维护可选证据交接合同。
- `2026-07-28` 仅在 `experiments/mcp-2026/` 验证，尚不宣称生产兼容。
- 本轮不 bump 版本，不 push，不发布 npm/GitHub Release。

## 核心契约

- `src/aggregation/search-evidence.ts` 是搜索结果过滤、域名策略、去重、
  评分和质量门的统一 interface；并行与瀑布路由必须复用它。
- 域名过滤在去重前执行，只接受精确主机名或真实子域，避免相似域名误命中，
  也避免被排除结果提前压掉允许域名的同标题结果。
- Adapter 名不等于独立来源；`source_count` 按
  `docs/contracts/provider-families-v1.json` 的 upstream provider family 统计。
- 原始数量不能单独提前停止；relevance、confidence 和 provider-family
  覆盖必须分别达标，执行结果通过 `meta.execution` 解释。
- 开启 semantic dedup/rerank 后，每个路由检查点都必须用变换后的展示篮子
  决定是否继续，并通过 `quality_gate_stage` 区分判断阶段。
- `free_search_advanced.time_range` 保留输入兼容但已弃用；传入时在引擎调用前
  返回机器可读的 `UNSUPPORTED_FILTER`，不再静默返回未过滤结果。
- DDG Lite 只在 HTML HTTP 202 后、同一 deadline 内尝试一次，不能增加增信。
- 冻结 benchmark 只验证格式、Token 和指标代码，不代表搜索质量。
- pooled capture 保留每个系统的内部路由信号，但 blinded reviewer packet
  必须移除这些信号；只有 completed adjudication 能生成阈值校准报告。

## 当前验证

- 稳定测试：605 passed / 54 files。
- 实验 MCP 2026：21 passed / 7 files。
- TypeScript/Windows build、冻结 Token benchmark 和 bootstrap quality
  benchmark：通过；bootstrap 仍不具备质量声明资格。
- Lint：0 errors / 68 个既有 warnings。

## 下一步

1. 在稳定网络 runner 用 `benchmarks/queries/routing-calibration.json`
   捕获至少 10 条非空、多系统 pooled query；单出口 DDG 202 只保留为负面证据。
2. 完成两模型 pointwise review 和第三模型分歧裁决，再运行
   `npm run benchmark:calibrate-relevance`；校准报告就绪前保持 `0.35` 不变。

## 文档权威

- 当前状态：本文件。
- 产品和使用方式：`README.md` / `README_zh.md`。
- 架构：`docs/architecture.md`。
- 当前计划：`docs/superpowers/plans/2026-07-22-iteration-roadmap.md`。
- 评测方法：`benchmarks/README.md`。
- 历史 plan/review/evidence 只作追溯，不复制到 HANDOVER。
