---
title: "Provider half-open probe lease plan"
status: completed
date: 2026-08-07
completed: 2026-08-07
---

# 目标

让 `HealthTracker` 独立拥有 Provider 尝试的准入、half-open 单探针和最终释放语义。
调用方只持有一次逻辑尝试的 lease，不读取或拼装 circuit 状态。

# 当前缺口

现有 `getAvailability()` 可以在冷却结束后把 circuit 切到 `half-open`，但没有显式记录
正在执行的 probe。成功和失败会更新健康状态；如果请求在 Provider 执行前因取消、预算
拒绝或限速等待失败而退出，当前接口没有对应的释放动作。并发调用也只能依赖内部状态的
间接效果，尚未通过单一所有者合同证明“最多一个 probe”。

这不是 live 可用性问题。它是离线可复现的状态所有权缺口，应先在本地修复和验证。

# 接口决策

由 `HealthTracker` 提供一个原子准入入口，例如：

```ts
type AttemptLease = {
  finish(outcome: AttemptOutcome): void;
};

type AttemptAdmission =
  | { allowed: false; reason: AvailabilityReason; retryAt: number | null }
  | { allowed: true; lease: AttemptLease };
```

`AttemptOutcome` 至少覆盖：

- `success`：记录延迟并关闭 circuit；
- `failure`：按现有失败类型和阈值更新 circuit；
- `suspended`：保留 Provider 声明的 cooldown 和失败类型；
- `released`：Provider 尚未执行时释放准入，不伪造成功或上游失败。

lease 绑定一次逻辑 Provider 尝试，覆盖该尝试内部的已有重试。`finish()` 必须幂等，
任何退出路径都只能结束一次。编排层不得设置 `half-open`、计数 probe 或修改 cooldown。

# 实施步骤

## 1. 先冻结状态机合同

- 为关闭、打开、冷却中、half-open 和 suspended 状态建立表驱动测试；
- 证明冷却结束后并发准入只有一个调用获得 lease；
- 证明其余并发调用得到稳定的拒绝原因和 `retryAt`，不触发 Provider；
- 保留现有持久化格式，除非测试证明必须升级；如需升级，先增加兼容读取测试。

## 2. 实现单一准入接口

- 用原子 `acquireAttempt(provider)` 替换编排层的“先检查、后记录”组合；
- 删除被替代的 circuit 状态判断，不保留第二个 owner；
- 保持 provider-declared suspension 与 generic circuit 分离；
- 不暴露可由调用方修改的 circuit 字段。

## 3. 接入搜索编排

- lease 在限速等待、预算 claim 和 Provider dispatch 之前取得；
- 取消、预算拒绝、限速等待失败和 dispatch 前异常使用 `released`；
- Provider 成功、分类失败和 challenge/429 suspension 使用对应 outcome；
- `partialFailures`、重试计数、请求预算和取消语义保持现有外部合同。

## 4. 补回归测试

- half-open 并发只执行一个 Provider 调用；
- 成功关闭 circuit，普通失败重新打开并应用现有 backoff；
- 取消、预算拒绝和限速等待失败都释放 lease；
- 重复 `finish()` 不重复计数或改写状态；
- challenge suspension 仍立即停止，不被 `released` 覆盖；
- 两个 runtime 的健康状态继续隔离。

# 非目标

- 不改变 MCP 工具签名、Provider 集合、路由顺序、重试次数或默认阈值；
- 不增加依赖、网络请求、自动 challenge 重试或持久化查询文本；
- 不在本阶段执行真实搜索、竞品采集或模型调用；
- 不把 circuit 状态公开为新的产品 API。

# 完成门禁

- 定向 health/orchestrator 测试通过；
- `npm run build`、`npm run lint`、`npm test` 通过；
- `npm run benchmark:quality:verify`、`npm run benchmark:verify` 通过；
- 取消、预算、限速和 suspension 的现有失败类型不变；
- Git diff 中没有新增网络 fixture、凭证、依赖或公开 MCP schema。

# 后续受限验证

完成本计划不自动授权联网。离线门禁通过后，可在用户再次确认且出口干净时执行独立的
双语 smoke：一个英文查询、一个中文查询，每条只选一个零密钥 Provider、Top-3、硬超时、
无重试、无 enrichment、无 artifact。遇到 429 或 challenge 立即停止整轮。该 smoke 只验证
请求上下文和失败合同，不属于 30 × 3 质量 capture，也不形成可用率或质量声明。

# 完成记录

- `HealthTracker.acquireAttempt()` 现在原子返回拒绝结果或幂等 attempt lease；
- `SearchRuntime` 的健康 interface 不再向编排层暴露 `recordSuccess()`、
  `recordFailure()` 或 `suspend()`；
- `getAvailability()` 只读，不再隐式取得 half-open probe；
- success、failure、suspended 和 released outcome 均由 lease 内部落入状态机；
- 并发单 probe、成功关闭、失败 backoff、suspension、重复 finish、取消、预算拒绝和
  限速等待失败均有离线回归；
- build、lint、84 个测试文件（831 通过、2 跳过）、package/capability、quality/format、
  query-set validator、competitive dry-run、exact-cache 和 intent-routing 全部通过；
- 没有执行真实搜索、模型调用、安装竞品、push 或发布。
