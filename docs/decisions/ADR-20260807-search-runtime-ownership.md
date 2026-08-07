# ADR-20260807：统一 Search Runtime 所有权

状态：Accepted
日期：2026-08-07

## Context

`free-search.ts` 曾在模块导入时分别创建配置、缓存、健康状态、指标、限速器和引擎策略。
`server.ts` 同时接收另一份 `Config`，导致工具注册、健康资源和服务器配置可能引用不同
运行状态。CLI 在导入后设置环境变量时也可能晚于配置读取。HTTP 模式必须为每个无状态
MCP transport 创建一个 server，但缓存、冷却和限速不能因此按请求重置。

## Decision

引入 `infrastructure/search-runtime.ts`，由一个 `SearchRuntime` 聚合：

- 已解析的 `Config`；
- cache、health、metrics、rate limiter 和 engine policy 端口；
- Provider Runtime Registry 的唯一 dispatch 端口。

进程入口解析配置后只创建一个 runtime。server factory 只接收 runtime 并从中派生 config，
不保留第二份配置入口。stdio server 和每个 HTTP transport server 都接收同一 runtime；
工具 registry 将它继续传给 `free_search`、`free_search_advanced` 和
`search_with_synthesis`，健康资源读取同一 health/metrics 实例。CLI 等直接调用者使用惰性
默认 runtime，避免模块导入时读取环境。

并发请求合并以 `WeakMap<SearchRuntime, Map<cacheKey, Promise>>` 隔离：同一 runtime 内相同
请求可复用 pending promise，不同 runtime 即使查询相同也不能共享结果或策略。

## Constraints

- 不改变 MCP 工具输入、输出或 Provider 集合；
- 不改变路由顺序、质量门、重试、冷却、预算或缓存键合同；
- HTTP transport 可按请求创建，process-owned runtime 不按请求创建；
- 测试通过结构化端口注入替代生产单例，不发真实网络请求。

## Consequences

配置和可变状态获得单一 owner，服务器、健康资源和搜索工具不会再漂移；测试可以替换一个
深接口并验证完整编排。代价是内部工具注册函数增加可选 runtime 参数，且进程入口必须显式
维护 runtime 生命周期。

## Verification

- 两个 runtime 对同一查询分别调用各自 dispatcher，结果不会跨 runtime 合并；
- `free_only` 在 dispatcher 前拒绝可选付费 Provider；
- 定向工具/运行时测试、完整离线测试、build、lint 和发布文件白名单约束该边界。
