# Conventions

> 编码规范。Agent 修改代码前必读。

## 命名

| 类别 | 规则 | 示例 |
|------|------|------|
| **文件/目录** | `snake_case.ts` | `free-search.ts`, `semantic-reranker.ts` |
| **函数** | `camelCase` | `searchWithFallback()`, `rerankBySemantics()` |
| **类/类型/接口** | `PascalCase` | `SearchResult`, `BraveProvider`, `ScoredResult` |
| **常量** | `UPPER_SNAKE` | `FREE_ENGINES`, `ENGINE_WEIGHTS` |
| **环境变量** | `UPPER_SNAKE` | `JINA_API_KEY`, `BRAVE_API_KEY` |

## 导入顺序

每组空行分隔：

```typescript
// 1. 标准库 / Node 内置
import { z } from 'zod';

// 2. 第三方
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// 3. 项目内部
import { SearchResult } from '../types.js';
import { scoreAndRank } from './scorer.js';
import { dedupByUrl } from './dedup.js';
```

## 类型注解

- **所有公共函数**必须有完整类型注解（参数 + 返回值）
- **私有函数**建议有
- 禁止使用 `any`（用 `unknown` + 类型守卫，或 `具体类型 | null`）
- 接口用 `interface`，类型别名用 `type`

## 函数签名模式

### 引擎模式
```typescript
// src/engines/{name}.ts
export async function search{Name}(
  query: string,
  count: number,
  options?: { signal?: AbortSignal }
): Promise<SearchResult[]>
```

### 工具模式
```typescript
// src/tools/{name}.ts
export function register{Name}(server: McpServer): void
```

### 聚合模式
```typescript
// src/aggregation/{name}.ts
export async function doSomething(
  input: InputType,
  options?: OptionsType
): Promise<ResultType>
```

## 异步

- 全部用 `async/await`
- 不用裸 `.then()` / `.catch()`
- 并发请求用 `Promise.allSettled()`（不中断）
- 超时用 `AbortSignal.timeout(N)` 

## 错误处理

- 引擎失败 → 返回空数组，不抛异常
- 聚合失败 → 返回原始数据（降级），不中断流程
- API 调用失败 → console.error 日志 + 正常降级返回
- 永远不要吞错误而不留日志

## 测试

- 测试文件放 `tests/`，与源码目录结构对应
- 命名: `describe('模块名')` + `it('具体行为描述')`
- 公共函数必须有测试覆盖
- 边界情况: 空数组、undefined、超时、错误返回
- Mock 外部 HTTP 请求（不依赖真实网络）

## 文档

- **README.md** — 用户入门 + 功能列表 + 竞品对比
- **CHANGELOG.md** — 版本变更记录（用户视角）
- **AGENTS.md** — 项目规范（Agent 视角）
- **HANDOVER.md** — 会话交接日志
- **ADR** `docs/decisions/ADR-YYYYMMDD-title.md` — 架构决策
- **Plans** `docs/plans/YYYY-MM-DD-title.md` — 功能计划

## 禁止

- ❌ 硬编码 API key
- ❌ 删除引擎 fallback 逻辑
- ❌ 改 MCP stdio 协议格式
- ❌ 引入不必要的运行时依赖
- ❌ 删除测试来换进度
