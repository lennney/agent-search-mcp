# Documentation Index

> 项目文档导航。新增文件时更新此页。

## 用户文档

| 文档 | 说明 |
|------|------|
| [README.md](../README.md) | 英文 - 安装、工具、配置、架构、竞品对比 |
| [README_zh.md](../README_zh.md) | 中文版 - 同上 |
| [CHANGELOG.md](../CHANGELOG.md) | 版本历史与变更记录 |

## 项目规范（Agent 必读）

| 文档 | 说明 |
|------|------|
| [AGENTS.md](../AGENTS.md) | 项目地图 — agent 进入项目的第一站 |
| [conventions.md](conventions.md) | 编码规范详情 |
| [release-process.md](release-process.md) | 发布流程 checklist |
| [architecture.md](architecture.md) | 系统架构文档（分层+数据流+关键模式） |
| [ARCHITECTURE-IMPROVEMENTS.md](ARCHITECTURE-IMPROVEMENTS.md) | 从竞品提炼的 8 个架构模式 |

## 路线图

| 文档 | 说明 |
|------|------|
| [superpowers/plans/2026-07-22-iteration-roadmap.md](superpowers/plans/2026-07-22-iteration-roadmap.md) | 当前路线图（v3.1.0 → v3.2.0） |
| [superpowers/plans/2026-07-16-agent-search-mcp-strengthening-roadmap.md](superpowers/plans/2026-07-16-agent-search-mcp-strengthening-roadmap.md) | 旧路线图 — 全部完成，已废弃 |

## 架构决策

| 文档 | 说明 |
|------|------|
| `decisions/ADR-YYYYMMDD-title.md` | 架构决策记录（按日期命名） |

## 开发文档

| 文档 | 说明 |
|------|------|
| `plans/YYYY-MM-DD-title.md` | 功能计划与评审 |
| `reviews/` | 安全/多平台/功能评审 |

## 会话管理

| 文档 | 说明 |
|------|------|
| [HANDOVER.md](../HANDOVER.md) | 会话交接日志（每次修改后更新） |
| [LEARNINGS.md](../LEARNINGS.md) | 踩坑经验记录 |

## 维护原则

- AGENTS.md 和 conventions.md 是 Agent 行为准则，修改前需确认
- HANDOVER.md 每次 session 结束更新，不超过 80 行
- 重大架构决策写 ADR，不写在 HANDOVER 里
- 文档与代码同时修改，不单独补文档
