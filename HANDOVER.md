---
type: HandoverDoc
title: Agent Search MCP handover
timestamp: '2026-07-26T05:30:00+08:00'
description: 当前状态、核心契约和下一步
tags:
- agent-search-mcp
- handover
---

# Agent Search MCP — Handover

## 当前状态

- `package.json` 当前版本为 `3.1.3`；本轮基线检查点是 `ef6cc82`。
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
- DDG Lite 只在 HTML HTTP 202 后、同一 deadline 内尝试一次，不能增加增信。
- 冻结 benchmark 只验证格式、Token 和指标代码，不代表搜索质量。

## 当前验证

- 稳定测试：596 passed / 53 files。
- 实验 MCP 2026：21 passed / 7 files。
- TypeScript/Windows build、冻结 Token benchmark 和 bootstrap quality
  benchmark：通过；bootstrap 仍不具备质量声明资格。
- Lint：0 errors / 68 个既有 warnings。

## 下一步

1. 用 10–20 条非空 pooled query 校准暂定的 `0.35` relevance floor；
   AI 只处理低置信或分歧样本，不扩大成长周期评测。
2. 关闭 semantic dedup/rerank 开启时的 post-semantic display-basket gate。
3. 实现或正式弃用 `free_search_advanced.time_range` 保留字段。
4. 在稳定网络 runner 捕获非空多系统 fixture；单出口 DDG 202 只保留为负面证据。

## 文档权威

- 当前状态：本文件。
- 产品和使用方式：`README.md` / `README_zh.md`。
- 架构：`docs/architecture.md`。
- 当前计划：`docs/superpowers/plans/2026-07-22-iteration-roadmap.md`。
- 评测方法：`benchmarks/README.md`。
- 历史 plan/review/evidence 只作追溯，不复制到 HANDOVER。
