# Documentation Index

文档按“用户入口、当前权威、历史证据”分层。新增文件前先判断能否更新现有
README、路线图、ADR 或 evidence；避免为一次会话新增长期维护入口。

## 用户入口

- [README.md](../README.md)：英文安装、能力、配置和产品定位。
- [README_zh.md](../README_zh.md)：中文用户入口。
- [CHANGELOG.md](../CHANGELOG.md)：面向用户的功能与修复记录。
- [HTTP deployment](http-deployment.md)：HTTP 安全和反向代理部署。

## 当前工程权威

- [AGENTS.md](../AGENTS.md)：Agent 约束和仓库地图。
- [HANDOVER.md](../HANDOVER.md)：仅记录当前状态、风险和下一步。
- [Conventions](conventions.md)：编码和文档规范。
- [Architecture](architecture.md)：稳定架构与核心数据流。
- [Iteration roadmap](superpowers/plans/2026-07-22-iteration-roadmap.md)：
  当前唯一主路线图。
- [Benchmark README](../benchmarks/README.md)：评测入口、口径和限制。
- [Agent Search architecture research](research/2026-07-26-agent-search-product-architecture.md)：
  固定 commit 的竞品/架构依据。
- [Slim Guard evidence contract](contracts/slim-guard-evidence-handoff-v1.md)：
  可选下游交接格式。

## 历史与证据

- `docs/plans/`、`docs/reviews/`：历史计划和评审，不表示当前状态。
- `docs/evidence/`：可复现证据和环境限制。
- `docs/decisions/`：仍有效的架构决策。
- `docs/geo/`：分发素材，不参与运行时契约。

## 维护规则

- HANDOVER 保持在 80 行以内，不追加会话流水账。
- 一个事实只保留一个权威来源；其他文档用链接，不复制状态和测试数量。
- 已被当前架构、研究或路线图完全覆盖的旧分析直接删除，Git 历史负责追溯。
- 只有重大不可逆架构决定新增 ADR；普通实现决策更新路线图或 CHANGELOG。
