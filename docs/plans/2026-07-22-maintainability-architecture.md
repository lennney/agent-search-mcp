---
type: Plan
title: agent-search-mcp 可维护性与架构收敛计划
date: 2026-07-22
status: proposed
related:
  - docs/architecture.md
  - docs/superpowers/plans/2026-07-22-iteration-roadmap.md
  - docs/superpowers/plans/2026-07-22-ddgs-independence.md
---

# 可维护性与架构收敛计划

## 目标

在不改变已有 MCP stdio 工具语义、不移除搜索 fallback、且不新增运行时依赖的前提下，收敛项目中重复的运行时事实和跨模块编排逻辑。

本计划将优先建立可测试的 deep module 和清晰的 seam，让版本、引擎目录、搜索编排、页面提取、应用启动各自拥有单一职责与单一事实来源。

## 本次架构发现

| 优先级 | 发现 | 证据 | 影响 |
|---|---|---|---|
| P0 | 运行时版本事实分散且更新检查存在路径 bug | `package.json`、`src/index.ts`、`src/infrastructure/http.ts`、`src/tools/capabilities.ts` 各自维护版本；`version-check.ts` 从 `src/dist/infrastructure` 仅回退一级读取 `package.json`，会回退为 `0.0.0` | MCP 元数据、HTTP health、CLI 更新提示可能不一致 |
| P1 | 引擎目录与执行计划重复维护 | `types.ts` / `engines/index.ts` 维护 11 个引擎；`free-search.ts` 另维护 7 个执行分支、权重、provider map、tier | 新增或调整引擎时易出现工具、CLI、schema、文档不一致 |
| P1 | 搜索编排集中在过宽的工具 module | `free-search.ts` 同时负责 MCP 注册、配置读取、单例状态、重试、限流、健康、缓存、瀑布、聚合和格式化 | 测试跨越 module interface，只能大量 mock 导入 |
| P2 | 应用启动与 transport 耦合 | `index.ts` import 后立即启动；配置在入口与 `free-search.ts` 分别读取；HTTP server 不承载 MCP server | 启动路径难以集成测试，B1 升级风险偏高 |
| P2 | Jina 提取规则重复 | MCP 提取、结果丰富化、CLI 各自发起请求或处理结果 | SSRF、超时、HTTP 状态与截断规则缺少 locality |

## 设计原则

1. **一个事实，一个 module**：版本、引擎能力、提取规则不能在多个调用方复制。
2. **interface 是测试面**：测试通过 module 的公开 interface 验证行为；不依赖 import 副作用或内部状态。
3. **只有真实 adapter 才建立 seam**：MCP、CLI、HTTP、内存测试替身等确实变化的调用方共享同一个 domain module。
4. **先收敛事实，再移动编排**：先解决低风险事实重复和路径错误，再改大规模搜索编排。
5. **兼容优先**：保留现有导出和工具输入；新增可选参数或兼容 facade，而不是一次性重写。
6. **协议升级独立决策**：Streamable HTTP 与 MCP 认证、Origin 校验、session 生命周期一起评审，不能作为普通重构夹带。

## 分期计划

### Phase 0 - 建立基线与防回归护栏 (P0, 半天)

**目的**：在移动实现前锁定当前外部行为。

| 工作 | 文件 | 验收 |
|---|---|---|
| 记录所有运行时版本输出 | `index.ts`、`cli.ts`、`http.ts`、`capabilities.ts`、`version-check.ts` | 测试覆盖 MCP initialize、`/health`、CLI `--version`、更新提示的当前版本 |
| 建立版本一致性测试 | `tests/infrastructure/app-metadata.test.ts` | 所有运行时输出与 `package.json` 的版本相同 |
| 移除能力资源中的构建统计 | `capabilities.ts` | 不再在运行时声明依赖数量、测试数量等发布时会过期的数据 |
| 更新文档统计策略 | README / HANDOVER / CHANGELOG | README 使用自动 badge 或只展示稳定能力，不把测试计数作为手工维护事实 |

**完成条件**：发现新硬编码版本或运行时统计时，测试或静态检查会失败。

### Phase 1 - AppMetadata：统一运行时包元数据 (P0, 1 天)

**目的**：让 `package.json` 成为 name、version、repository 的唯一事实来源。

#### 目标 module

```typescript
export interface AppMetadata {
  readonly name: string;
  readonly version: string;
  readonly repositoryUrl: string;
}

export function loadAppMetadata(): AppMetadata;
export const appMetadata: AppMetadata;
```

**建议位置**：`src/infrastructure/app-metadata.ts`

**实现约束**：

- 在 Node ESM 中通过 `createRequire(import.meta.url)` 读取 `../../package.json`；该相对位置从 `src/infrastructure` 与 `dist/infrastructure` 都能回到包根目录。
- 读取后校验字段并冻结结果；读取失败应抛出带上下文的启动错误，不能静默回退到 `0.0.0`。
- 测试可通过依赖注入或专用加载函数使用临时 package metadata；不修改 `process.cwd()`。

#### 迁移调用方

| 调用方 | 修改 |
|---|---|
| `src/index.ts` | `McpServer` 使用 `appMetadata.name` / `appMetadata.version` |
| `src/cli.ts` | 删除自身的 `readFileSync`；显示 `appMetadata.version` |
| `src/infrastructure/version-check.ts` | 删除 `CURRENT_VERSION` 与文件路径计算；使用 `appMetadata` |
| `src/infrastructure/http.ts` | `createHttpServer` 使用默认 metadata，并允许测试传入 metadata adapter |
| `src/tools/capabilities.ts` | 使用 metadata；删除测试数、依赖数等易过期字段 |

**测试**：

- `loadAppMetadata()` 读取根 `package.json`，并对缺失字段失败。
- CLI、MCP initialize、HTTP `/health`、capabilities 与更新提示使用相同版本。
- 构建后的 `dist/` 路径也能解析 package metadata。

**完成条件**：`rg "version: '" src`、`rg "CURRENT_VERSION" src` 不再发现独立版本事实；唯一版本值是 `package.json`。

### Phase 2 - 发布事实与自动化 (P1, 0.5-1 天)

**目的**：区分运行时 metadata 与发布文档 metadata，避免下一次发布再次手工同步。

| 工作 | 说明 |
|---|---|
| 发布前校验脚本 | 新增 `scripts/check-release-metadata.mjs`，检查包版本、运行时 metadata、CHANGELOG Unreleased 状态 |
| 文档统计去硬编码 | 使用 GitHub Actions 测试结果 badge，或从用户文档移除精确测试数；历史 CHANGELOG 数字保留为历史记录 |
| 发布自动化评估 | 评估 Release Please 的 Node release PR 流程；它可基于 Conventional Commits 更新 `package.json`、CHANGELOG、tag 和 GitHub Release |

**完成条件**：一次版本 bump 不再要求手工编辑多个运行时文件；发布校验可在 CI 失败。

### Phase 3 - EngineCatalog：统一引擎事实与搜索计划 (P1, 2-3 天)

**目的**：让引擎的 metadata、可用性、provider group、权重和执行 adapter 集中在一个 catalog 中；搜索顺序成为命名计划而不是分散数组。

#### 目标 module

```typescript
interface EngineDefinition {
  readonly info: SearchProviderInfo;
  readonly providerGroup: string;
  readonly weight: number;
  readonly tier: 'free' | 'paid';
  search(query: string, limit: number): Promise<SearchResult[]>;
}

interface EngineCatalog {
  get(id: SearchProvider): EngineDefinition;
  list(): readonly EngineDefinition[];
  resolvePlan(name: 'default' | 'waterfall' | 'advanced'): readonly SearchProvider[];
}
```

**范围**：

1. 先保留静态 import；不把 catalog 与路线图 C3 的惰性加载绑在一起。
2. 将 `ALL_ENGINES`、免费/付费数组、provider map、权重、switch 分支收敛到 catalog。
3. 从 catalog 派生 CLI 可选引擎、Zod enum、policy 测试和 capabilities 资源的引擎列表。
4. 不在本 phase 中改变默认搜索计划或突然让原本未调用的引擎参与 `free_search`；行为变化必须单独评审。

**测试**：

- catalog 必须覆盖 `SearchProvider` 联合类型的全部成员。
- 每一个搜索计划只包含 catalog 中存在的引擎。
- provider group 去重、付费 key 缺失、policy 拒绝通过 catalog interface 验证。

**完成条件**：新增引擎或调整 metadata 时只改 catalog 与对应引擎 adapter；没有并行的数组或 switch。

### Phase 4 - SearchRuntime：收拢搜索编排 (P1, 3-5 天)

**前置依赖**：Phase 3。

**目的**：保留 `searchWithFallback()` 兼容 facade，将缓存、请求合并、限流、健康、重试、瀑布、聚合收进可构造的运行时 module。

```typescript
interface SearchRuntimeDependencies {
  catalog: EngineCatalog;
  policy: EnginePolicy;
  cache: SearchCache;
  health: HealthTracker;
  rateLimiter: RateLimiter;
  logger: Logger;
  sleep(milliseconds: number): Promise<void>;
}

interface SearchRuntime {
  search(input: SearchInput): Promise<SearchResponse>;
}

export function createSearchRuntime(
  dependencies: SearchRuntimeDependencies,
): SearchRuntime;
```

**迁移策略**：

1. 先提取无副作用的 `SearchInput` / `SearchResponse` 与结果收尾逻辑。
2. 以当前单例创建默认 runtime；保留原导出作为 facade。
3. 再将请求合并、并行搜索、瀑布搜索逐块迁入 implementation。
4. 最后把 MCP 和 CLI 改为两个 adapter 调用 runtime interface。

**测试**：使用内存 catalog、cache、clock/sleep adapter 覆盖 retry、超时、policy、缓存和瀑布早退出；不再为这些行为 mock 整个 `free-search.ts` import 图。

**完成条件**：`free-search.ts` 只保留 MCP schema 与结果呈现；编排错误集中在 runtime module。

### Phase 5 - JinaExtractor：收敛提取安全规则 (P2, 1-2 天)

**目的**：用一个 extraction module 让 MCP、结果丰富化、CLI 共享 URL 校验、超时、HTTP 状态、截断和错误映射。

```typescript
interface ExtractionResult {
  content: string;
  truncated: boolean;
}

interface JinaExtractor {
  extract(url: string, options?: ExtractionOptions): Promise<ExtractionResult>;
}
```

**范围**：

- `free-extract.ts`、`aggregation/enricher.ts`、`cli.ts` 只作为 adapter。
- `url-validator.ts` 仍是唯一 SSRF 规则 module；extractor 只依赖其 interface。
- 通过注入 `fetch` 创建可预测的测试 adapter。

**完成条件**：同一 URL 在三个调用方得到一致的 SSRF、timeout、status 与 length 行为。

### Phase 6 - Composition root 与 Streamable HTTP (P2, 单独决策)

**前置依赖**：Phase 4；并且需要按项目规则获得 MCP 协议变更授权。

**目的**：让入口只负责读取环境与启动；应用构造、工具注册与 transport 生命周期通过一个 composition root 集中。

```typescript
interface Application {
  mcpServer: McpServer;
  startStdio(): Promise<void>;
  startHttp(): Promise<void>;
}

export function createApplication(
  config: RuntimeConfig,
  dependencies?: ApplicationDependencies,
): Application;
```

**注意**：

- HTTP adapter 必须在此 phase 升级为 MCP Streamable HTTP，而不是继续维护独立 health/SSE placeholder。
- 迁移时校验 Origin、localhost bind、认证策略、`MCP-Protocol-Version` 和旧 SSE 兼容策略。
- 不改 stdio JSON-RPC 行为；HTTP 迁移需要独立 E2E 测试和兼容性矩阵。

## 交付顺序与发布建议

| 发布 | 内容 | 风险 | 预估 |
|---|---|---|---|
| v3.1.x patch | Phase 0-1：AppMetadata、`0.0.0` bug、版本一致性测试 | 低 | 1-2 天 |
| v3.2.x minor | Phase 2-3：发布护栏、EngineCatalog | 中 | 3-4 天 |
| v3.3.x minor | Phase 4：SearchRuntime | 中 | 3-5 天 |
| 独立 RFC / minor | Phase 5：JinaExtractor | 低-中 | 1-2 天 |
| 独立 RFC / minor | Phase 6：composition root + Streamable HTTP | 高 | 3-5 天 |

## 非目标

- 不新增搜索引擎或修改现有 fallback 语义。
- 不在 EngineCatalog phase 中开启更多默认引擎。
- 不把 Streamable HTTP 作为普通重构的一部分上线。
- 不在运行时读取 README、CHANGELOG 或测试输出作为 metadata。
- 不在本计划中引入 DI 框架、ORM 或额外运行时依赖。

## 决策点

1. **Phase 1 后**：确认 `package.json` 继续作为唯一运行时版本事实，还是改为构建时生成 metadata；默认推荐前者，因为 Docker 与 npm 包均包含 package metadata。
2. **Phase 3 前**：确认哪些引擎应进入哪些产品搜索计划；catalog 只收敛事实，不替代产品决策。
3. **Phase 6 前**：评审 Streamable HTTP、Origin 校验、认证、session 和旧 SSE 兼容范围，并写 ADR。

## 外部参考

- [Node.js ESM documentation](https://nodejs.org/api/esm.html)：ESM 的相对解析与 `module.createRequire()` 用法。
- [MCP transports specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)：Streamable HTTP 取代旧 HTTP+SSE，且要求协议版本与安全约束。
- [Release Please](https://github.com/googleapis/release-please)：基于 Conventional Commits 的 release PR，可更新 `package.json`、CHANGELOG、tag 与 GitHub Release。
