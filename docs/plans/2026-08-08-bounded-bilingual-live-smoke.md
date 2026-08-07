---
title: "Bounded bilingual request-context live smoke"
status: completed
date: 2026-08-08
completed: 2026-08-08
---

# 目标

用两次真实、串行、零重试请求验证 P1 双语 `SearchRequestContext` 能进入构建后的
Provider dispatcher 和 Wikipedia 适配器。该阶段只验证时间点可用性和请求合同，不评价
搜索质量。

# 固定范围

- 英文查询一条，`language=en`，Provider 为 `wikipedia`，Top-3；
- 中文查询一条，`language=zh`，Provider 为 `wikipedia`，Top-3；
- 两次调用之间至少间隔 10 秒；
- 每次使用 15 秒硬超时，不重试、不 enrichment、不 query expansion；
- 只输出状态、解析后的语言/区域、结果数、延迟和失败类型；
- 不保存标题、snippet、URL、原始响应或 live fixture；
- 不调用 DDG、Sogou、Yandex、竞品系统或 OpenAI API。

# 停止规则

- 任何 `bot_challenge`、`rate_limit` 或 HTTP 429 立即结束整轮；
- 普通 timeout、解析失败或空结果只记录当前观察，不自动补发；
- 不切换代理、User-Agent、出口或 Provider 来追求成功结果；
- 两次请求结束后停止，不扩大为 qualification 或 30 × 3 capture。

# 执行前门禁

- [x] P1.5 完整离线门禁通过；
- [x] 用户于 2026-08-08 明确允许联网测试；
- [x] 从当前源码重新 build，避免运行旧 `dist`；
- [x] 路线图和 HANDOVER 标记 P1.6 执行中。

# 完成条件

- [x] 英文调用有一条脱敏观察；
- [x] 若未触发停止规则，中文调用有一条脱敏观察；
- [x] 文档记录实际调用数及停止原因；
- [x] 不产生仓库内外的结果原文 artifact；
- [x] 不形成质量、可用率或竞品胜负声明。

# 执行结果

2026-08-08 从当前源码 build 后串行执行 2 次调用：

| Sample | Provider | Context | 状态 | 结果数 | 延迟 | 失败类型 |
|--------|----------|---------|------|--------|------|----------|
| `p1.6-en` | Wikipedia | `en` / `us-en` | success | 3 | 2,485 ms | 无 |
| `p1.6-zh` | Wikipedia | `zh` / `cn-zh` | success | 3 | 3,931 ms | 无 |

两次调用之间等待至少 10 秒，实际请求数为 2。没有重试、enrichment、query expansion、
429、challenge、代理切换或 Provider 切换。停止原因为计划内样本完成。没有保存结果标题、
snippet、URL、原始响应或 live fixture。

该结果只证明本次出口上的双语上下文、runtime dispatcher 和 Wikipedia adapter 在两个
时间点完成了请求。它不证明稳定可用率、相关性、其他 Provider 状态或系统间质量差异。
