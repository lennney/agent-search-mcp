# ADR-20260807：统一 Provider Runtime Registry

状态：Accepted
日期：2026-08-07

## Context

Provider 的运行时事实目前分布在 `SEARCH_PROVIDERS`、engine metadata registry、调用
switch、权重、waterfall phase、provider-family TypeScript 映射和 JSON 合同中。测试能
检查部分 parity，但新增或调整 Provider 仍需要同步修改多处，`free-search.ts` 也因此
同时拥有过多职责。

DDGS 的 engine registry 证明 metadata、provider identity 和 executor 可以由同一注册
入口拥有；SearXNG 的 processor/engine 分离证明 transport policy 不应重复在 adapter
中。Agent Search 还需要保留自身更深的 provider-family、失败、预算和质量门合同。

## Decision

引入两个单一职责、单向依赖的注册模块：

- `provider-catalog.ts` 拥有静态事实，并派生 ID、metadata、access group、credential、
  family、weight 和 waterfall phase；
- `runtime-registry.ts` 为每个 catalog entry 绑定唯一 executor。

运行时 descriptor 等价于：

```ts
interface ProviderDescriptor {
  id: SearchProvider;
  name: string;
  access: 'zero-key' | 'optional-api';
  languages: string[];
  family: string;
  weight: number;
  waterfallTier?: '1a' | '1b' | '1c';
  credentialEnvironment?: string;
  search(query: string, count: number, options: EngineSearchOptions): Promise<SearchResult[]>;
}
```

静态 catalog 不导入 adapter，避免 `types.ts`、schema 或 metadata 消费者在导入时初始化
全部 adapter。runtime registry 导入 catalog 和 adapter，并由编排层的 `searchProvider()`
调用。注册表派生 metadata、free/optional 分组、工具描述、能力矩阵、doctor 和 invocation。
`provider-families-v1.json` 继续作为跨仓库版本化合同，通过测试与 descriptor 投影保持
一致，不在运行时读取文档文件。

## Constraints

- 不改变 MCP 输入/输出签名；
- 不新增 Provider 或运行时依赖；
- 不改变当前 waterfall 顺序、权重、family 或 spend policy；
- adapter 仍拥有 provider-specific request/parse；
- shared transport 仍拥有 timeout/HTTP/challenge；
- orchestrator 仍拥有 budget/retry/health/routing；
- 重构完成后删除旧 switch/重复事实，不保留双 owner。

## Acceptance

- `SEARCH_PROVIDERS`、metadata、credential、family、weight、phase 和 executor 有明确单一
  owner；
- 每个 Provider 的直接 adapter 测试保持；
- registry parity、provider-family contract、routing order、spend policy 和完整测试通过；
- 生产输出 fixture 不发生非预期变化；
- `free-search.ts` 不再直接 import 每个 adapter 或维护调用 switch。

## Consequences

收益是更低修改成本、更小的编排模块和更可靠的派生文档。代价是 registry 本身成为必须
严格测试的深模块，并且新 Provider 必须同时提供 catalog entry 与 executor binding。

## Verification

- `free-search.ts` 已删除各 adapter 直引、调用 switch、权重和 phase 副本；
- adapter 兼容 metadata 导出直接引用 catalog；
- registry parity、9/7 access 分组、三段 waterfall、family JSON、credential、routing 和
  spend-policy 定向测试通过；
- 没有新增 Provider、依赖或公开 MCP 合同。
