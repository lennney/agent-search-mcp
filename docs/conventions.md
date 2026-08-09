# Conventions

> 编码规范。Agent 修改代码前必读。

## 命名

| 类别 | 规则 | 示例 |
|------|------|------|
| **文件/目录** | `kebab-case.ts` | `free-search.ts`, `free-search-advanced.ts` |
| **函数** | `camelCase` | `searchWithFallback()`, `searchDuckDuckGo()` |
| **类/类型/接口** | `PascalCase` | `SearchResult`, `BraveProvider`, `ScoredResult` |
| **常量** | `UPPER_SNAKE` | `FREE_ENGINES`, `ENGINE_WEIGHTS` |
| **环境变量** | `UPPER_SNAKE` | `HTTP_AUTH_TOKEN`, `BRAVE_API_KEY` |

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
  options?: { signal?: AbortSignal; throwOnError?: boolean }
): Promise<SearchResult[]>
```

### 工具模式
```typescript
// src/tools/{name}.ts
export function register{Name}(server: McpServer): void
```

搜索工具的内部注册函数可额外接收 `SearchRuntime`。生产 server 必须传入进程拥有的同一
runtime；直接测试或兼容调用可以省略，并由搜索入口惰性取得默认 runtime。不要在工具模块
顶层创建 config、cache、health、metrics、rate limiter 或 engine policy 单例。

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
- 并发 Provider 请求必须逐项保留 outcome；可用 `Promise.allSettled()`，或在
  Provider 边界把异常转换为显式成功/失败结果，不能让一个失败抹掉其他结果
- 超时必须与调用方 `AbortSignal` 组合，不能用新的 timeout signal 覆盖取消信号

## 错误处理

- 直接调用 adapter 默认可软失败为空数组；编排器传 `throwOnError: true` 时必须抛出
  可分类错误，以便响应保留 `partialFailures`
- 聚合失败 → 返回原始数据（降级），不中断流程
- API 调用失败 → 通过 `logger` 写入 stderr，并正常降级返回
- MCP Server/runtime 禁止直接使用 `console`；人类直接调用的 CLI 入口可使用
  stdout/stderr，适用文件由 ESLint 精确限定
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
