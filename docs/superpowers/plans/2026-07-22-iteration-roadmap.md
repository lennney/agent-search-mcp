# agent-search-mcp 迭代路线图 — v3.2.0 → 下一可发布版本

> **状态**: v3.2.0 已发布到 npm `latest`；仓库当前为 16 个搜索适配器
> （9 个零密钥 + 7 个可选 API）。本地 `main` 有两个尚未 push 的检查点，当前没有
> 可发布 tarball。下一版本不预先承诺版本号或发布日期。
> **旧 6 阶段路线图** (2026-07-16): ✅ Phase 1-6 全部完成 — 见尾部"旧路线图状态"表。
> 下方 Phase A-D 是通向 v3.2.0 的历史规划，继续保留作决策记录。当前执行顺序以本节
> 和文末 P1.5/P1.6、P1.3、P2 条目为准。

---

## 当前执行顺序

| 顺序 | 阶段 | 状态 | 完成条件 |
|------|------|------|----------|
| 1 | P1.5 half-open probe lease | 已完成，未提交 | 状态机、并发与所有退出路径已通过完整离线门禁 |
| 2 | P1.6 双语 request-context smoke | 已完成 | Wikipedia 英中各一条成功；无原文 artifact |
| 3 | P1.3 三系统正式 capture | 1/90 因 bot challenge 中止，待新 runner | 30 条预注册查询、完整 checkpoint、私有 artifact |
| 4 | P2 双评审与分歧裁决 | 待完整 pool | 固定模型与预算完成合同验证，不静默替换 |
| 5 | P1.1 relevance calibration | 待 completed qrels | 只生成内部校准证据，不自动修改生产阈值 |
| 6 | 下一 release candidate | 待上述证据和发布决策 | 从最终提交生成唯一 tarball 并重跑发布矩阵 |

push、真实 capture、模型调用、npm publish、GitHub Release、Registry 和推广均为独立
授权门。P1.6 不是质量 capture，也不能用于搜索质量或可用率声明。

## v3.2.0 历史路线图概览

```
           v3.1.0
        (历史起点)
            │
    ┌───────┼───────┬───────┬───────┐
    │       │       │       │       │
  Phase A  Phase B  Phase C  Phase D  On-going
  Agent UX  标准合规  性能优化  测试稳定  分发推广
    │       │       │       │       │
    ├ A1    ├ B1    ├ C1    ├ D1    ├ O1 awesome-mcp
    ├ A2    ├ B2    ├ C2    ├ D2    ├ O2 掘金文章
    ├ A3    └ B3    ├ C3    ├ D3    ├ O3 mcp.directory
    └ A4             └ C4    └ D4    └ O4 V2EX/gh.l-web
            │       │       │       │
    └───────┴───────┴───────┴───────┘
           v3.2.0 已发布
```

| Phase | 内容 | 工作量 | 依赖 | 发布价值 |
|-------|------|--------|------|---------|
| **A** | Agent UX 优化 | 3-4 天 | 无 | Agent 工具选择准确率↑ 50%+ |
| **B** | MCP 标准合规 | 2-3 天 | 无 | 适配 2025 spec，防废弃 |
| **C** | 性能优化 | 2-3 天 | D4 | DDG 可用率↑, 启动速度↑ |
| **D** | 测试与稳定性 | 2-3 天 | 无 | 付费引擎测试覆盖、安全加固 |
| **O** | 分发推广 (持续) | 持续 | 无 | Stars↑, downloads↑ |

---

# Phase A: Agent 使用体验优化

> **竞品对标**: Anti-Patterns Guide (Digital Applied), 54 Patterns (Arcade.dev), AWS Prescriptive Guidance
> **核心原则**: Tool schema 是 Agent 的契约，不是文档。

## A1: `setupFetchTools` 拆分 (P0)

**目标**: 将 3 个 fetch 工具拆分为独立注册函数，支持细粒度 `ENABLED_TOOLS` 控制。

当前问题：`setupFetchTools` 一次性注册 `fetch_github_readme` / `fetch_csdn_article` / `fetch_juejin_article`。`ToolPolicy` 只能全开/全关。

**改动清单**:

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/tools/fetch-tools.ts` | 重构 | 拆成 3 个独立函数并 export |
| `src/index.ts` | 修改 | 分别 import + register 3 个工具 |

**关键实现**:

```typescript
// src/tools/fetch-tools.ts — 拆解后
export function setupFetchGithubReadme(server: McpServer): void
export function setupFetchCsdnArticle(server: McpServer): void
export function setupFetchJuejinArticle(server: McpServer): void
// 保留老函数做向后兼容
export function setupFetchTools(server: McpServer): void
```

```typescript
// src/index.ts — 分拆注册 + policy check
import { ToolPolicy } from './infrastructure/tool-policy.js';

const policy = new ToolPolicy(config.ENABLED_TOOLS, config.DISABLED_TOOLS);
if (policy.isToolEnabled('fetch_github_readme')) setupFetchGithubReadme(server);
if (policy.isToolEnabled('fetch_csdn_article'))  setupFetchCsdnArticle(server);
if (policy.isToolEnabled('fetch_juejin_article')) setupFetchJuejinArticle(server);
```

**测试**: vitest — 验证 `ToolPolicy` 能分别控制 3 个工具的注册状态 (+1 test file, ~6 tests)

**验证**: `npm test` 438→444+, `npm run build` ✅

---

## A2: MCP Tool annotations (readOnlyHint) (P1)

**目标**: 从纯文本 `@readOnly true` 升级为 MCP spec 2025 标准 `annotations` 字段。

当前：在 tool description 内用 `@readOnly true @idempotent true` 文本标注（Glama TDQS 识别但非标准格式）。

MCP spec 2025 定义 `Tool.annotations`:

```typescript
interface Tool {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
  annotations?: {
    readOnlyHint?: boolean;     // true = safe to retry without side effects
    idempotentHint?: boolean;   // true = duplicate calls have same effect
    destructiveHint?: boolean;  // true = requires user confirmation
  };
}
```

**改动清单**:

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/tools/free-search.ts` | 修改 | `.tool()` 第三个参数加 `annotations` |
| `src/tools/free-search-advanced.ts` | 修改 | 同上 |
| `src/tools/free-extract.ts` | 修改 | 同上 |
| `src/tools/search-with-synthesis.ts` | 修改 | 同上 |
| `src/tools/free-search-news.ts` | 修改 | 同上 |
| `src/tools/fetch-tools.ts` | 修改 | 3 个工具各加 annotations |

**关键实现**: `@modelcontextprotocol/sdk` ^1.29.0 是否支持 `annotations`?

需验证 SDK 类型定义。如果不支持，走自定义 tool wrapper 或等 SDK 升级。

```typescript
server.tool(
  'free_search',
  {
    ... // 现有 params
  },
  async (params) => { ... },
  { readOnlyHint: true, idempotentHint: true } // 需要 SDK 支持
);
```

**测试**: vitest — 验证 tool definition 包含 annotations 字段

**验证**: `npm test` ✅, `npm run build` ✅, 确认 SDK 支持

---

## A3: 错误区分度提升 (P1)

**目标**: 引擎失败时返回结构化错误信息，帮助 Agent 智能恢复。

当前：引擎统一返回空数组 `[]`，无区分 `timeout / 4xx / 5xx / permission denied`。

**实现模式** (Anti-Patterns Guide + Arcade.dev Error-Guided Recovery):

```typescript
interface EngineError {
  engine: string;
  type: 'validation_error' | 'timeout' | 'upstream_4xx' | 'upstream_5xx' | 'rate_limited' | 'permission_denied' | 'unknown';
  message: string;
  suggestion: string; // "Retry in 30s" / "Check API key" / "Try a different engine"
}
```

**改动清单**:

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/types.ts` | 新增 | `EngineError` interface |
| `src/tools/free-search.ts` | 修改 | 引擎错误改为结构化类型 |
| 各 `src/engines/*.ts` | 修改 | 错误路径返回 `{ results, errors }` 而非仅结果 |

**测试**: vitest — 验证各引擎 mock 错误返回结构正确 (+2 test files, ~10 tests)

**验证**: `npm test` ✅, `npm run build` ✅

---

## A4: capabilities 资源扩展 (P2)

**目标**: `search://capabilities` 增加更多 Agent 引导信息。

当前 capabilities 返回快速用法。可加：
- 每个工具的 "Best for / Not recommended for" 摘要
- Agent 发现信息（GitHub/npm 链接）
- 版本号 + 引擎列表

**改动清单**:

| 文件 | 操作 |
|------|------|
| `src/tools/capabilities.ts` | 扩展 Resource 内容 |

**验证**: `npm run build` ✅

---

# Phase B: MCP 标准格式兼容

> **竞品对标**: MCP Spec 2025-11-25, Streamable HTTP 取代 HTTP+SSE
> **核心**: 兼容最新协议 → 不被客户端废弃

## B1: Streamable HTTP 升级 (P0)

**目标**: 将 `http.ts` 从已废弃的 HTTP+SSE 改为 MCP 2025 标准的 Streamable HTTP。

当前：`src/infrastructure/http.ts` 使用 2024-11-05 的 HTTP+SSE transport。

MCP 2025-11-25 的变化：
- HTTP+SSE → **Streamable HTTP**（单一 POST 连接，SSE 在响应体流式发送）
- 服务端不再需要 SSE endpoint
- `Authorization` header 标准支持

**改动清单**:

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/infrastructure/http.ts` | 重写 | Streamable HTTP transport |
| `src/index.ts` | 修改 | 初始化方式适配 |
| `package.json` | 可能升级 | 确认 SDK 支持 Streamable HTTP |

**需先调研**: `@modelcontextprotocol/sdk` ^1.29.0 是否内置 Streamable HTTP 支持。

如果不支持，两种方案：
1. 升级到 SDK 最新版本
2. 用 `@modelcontextprotocol/sdk` 的 `StreamableHTTPServerTransport`（如存在）

**测试**: vitest — HTTP 模式启停测试 (+1 test file, ~5 tests)

**验证**: `npm test` ✅, `npm run build` ✅, 手动测试 `npm run dev:http` 可正常连接

---

## B2: MCP Spec 2025 全合规审计 (P1)

**目标**: 系统检查所有 MCP 接口是否符合 2025-11-25 spec。

检查清单：

| 项目 | 当前 | 目标 |
|------|------|------|
| Tool schema JSON Schema | ✅ Zod 生成 | ✅ |
| Resource list/read | ✅ health + capabilities | ✅ |
| Prompt templates | ❌ 未实现 | 可选（非必需）|
| Sampling | ❌ 未实现 | 可选 |
| Tool annotations | ❌ 文本标注 | ✅ 见 A2 |
| Error codes (JSON-RPC) | ⚠️ 未标准化 | 确认 -32602 等规范 |
| Transport: stdio | ✅ | ✅ |
| Transport: Streamable HTTP | ❌ HTTP+SSE | ✅ 见 B1 |
| Logging to stderr | ✅ pino | ✅ |
| Capabilities negotiation | ⚠️ 未显式声明 | 启动时声明支持的 capabilities |

**改动清单**:

| 文件 | 操作 |
|------|------|
| `src/index.ts` | 修改 | 服务器初始化时声明 capabilities |
| 无 | 调研报告 | 确认缺口后定改 |

**验证**: `npm run build` ✅, 对照 MCP spec 逐项通过

---

## B3: OpenAPI Spec (P2, 可选)

**目标**: 为 HTTP 模式生成 OpenAPI 3.0 spec 文档。

HTTP 模式下 MCP 工具映射为 REST 端点，OpenAPI 可让非 MCP 客户端（curl, Postman）使用。

**改动清单**:

| 文件 | 操作 |
|------|------|
| `docs/openapi.yaml` | 新增 | OpenAPI 3.0 spec |
| 或 `src/infrastructure/openapi.ts` | 新增 | 运行时生成 |

**验证**: `npm run build` ✅

---

# Phase C: 性能优化

> **竞品对标**: web-search-mcp (Playwright 浏览器搜索), gajae-code (TLS 指纹)
> **核心**: 消除 Python 最后的硬依赖 + 让 DDG 可用率接近 100%

## C1: 新闻搜索语义收敛 (P0)

**状态**: 2026-07-27 撤销。DDG HTML 只是通用网页，Bing News 的受限 Live
Smoke 也未得到稳定 RSS 响应，因此删除 `free_search_news`、Bing News 运行时
路径及专属测试。通用搜索继续拒绝无法跨引擎兑现的 `time_range`。

以后重新引入新闻工具仍需按新增引擎门禁单独评审，并先取得可复现的真实源证据。

---

## C2: DuckDuckGo Lite 同源机会性尝试 (P1)

**状态**: 代码与确定性 fixture 已完成；跨网络可用率证据仍待稳定 runner。

**目标**: 当 `html.duckduckgo.com` 返回 202 时，在同一总 deadline
内最多尝试一次 `https://lite.duckduckgo.com/lite/`，同时保持失败透明。

Lite HTML 结构不同：
- 结果 class: `.result-link` (标题) / `.result-snippet` (摘要)
- 无 JavaScript，纯表格布局

2026-07-26 源码调查修正了最初假设：SearXNG 和 DDGS 当前都没有
HTML → Lite 自动回退，且 SearXNG 将二者描述为同一类 IP 级 bot blocker。
因此本实现是项目自己的机会性兼容路径，不宣称 Lite 限流更宽松，也不把
HTML/Lite 算成两个来源。

**改动清单**:

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/engines/duckduckgo-html.ts` | 扩展 | 新增 `searchDuckDuckGoLiteHtml()` |
| 同上 | 修改 | HTML 202 时最多一次 Lite attempt，共享取消与总 deadline |
| `src/aggregation/dedup.ts` | 修改 | HTML/Lite 保持同一 provider family，不增加 `source_count` |
| `tests/engines/duckduckgo-html.test.ts` | 扩展 | DOM 邻近配对、双失败、软失败和取消 |

**回退链**: 页面签发 Web preload → cheerio HTML → Lite HTML → 空数组

**测试**: vitest — mock Lite HTML 响应 + 202 触发回退验证

**验证边界**:

- [x] 同一逻辑 engine / provider family；
- [x] HTML 202 后仅一次 Lite attempt；
- [x] 调用方取消后不启动 Lite；
- [x] Lite parser 按相邻 table row 关联摘要，不用全局数组 index；
- [ ] 在不同网络 runner 捕获非空 Lite fixture，证明机会性收益；
- [ ] 在真实捕获完成前，不发布“DDG 可用率提升”数字。

研究依据:
[`docs/research/2026-07-26-agent-search-product-architecture.md`](../../research/2026-07-26-agent-search-product-architecture.md)

---

## C3: 引擎惰性加载 (P1)

**目标**: 启动时只 import 配置的引擎，而非全部 11 个。

当前：`src/index.ts` 的 import 树会加载全部引擎文件，即使引擎被 `ALLOWED_ENGINES` / `DENIED_ENGINES` 排除。

**原理**: TypeScript/Node.js 的静态 import 在模块加载时执行所有顶层代码。`import` 本身就是 eager 的。改动态 `import()`。

**改动清单**:

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/tools/free-search.ts` | 重构 | 引擎从静态 import 改为动态 `engineFactory` 注册模式 |
| `src/engines/index.ts` | 修改 | 提供 `getEngine(name)` 工厂函数 |
| `src/engines/duckduckgo.ts` 等 | 不变（引擎本身不变，只是加载时机变） | |

**关键实现**:

```typescript
// src/engines/index.ts — 惰性注册
const ENGINE_REGISTRY = new Map<string, () => Promise<EngineModule>>();

export function registerEngine(name: string, loader: () => Promise<EngineModule>): void {
  ENGINE_REGISTRY.set(name, loader);
}

export async function getEngine(name: string): Promise<EngineModule> {
  const loader = ENGINE_REGISTRY.get(name);
  if (!loader) throw new Error(`Engine '${name}' not registered`);
  return loader();
}
```

各引擎文件在自己的模块级别调用 `registerEngine()`（但 `import` 已经在 bundler 时确定了…）

**更实际的方案**: 保持静态 import，而是在 `searchWithFallback()` 中增加"跳过被禁引擎"的 guard。这已经实现了（通过 `enginePolicy.filterEngines()`）。所以**实际惰性加载收益不大**，因为 import 本身在 Node.js ESM 中几乎无开销（只加载符号表，不执行函数体）。

**建议**: 验证耗时，如果启动无瓶颈则标记为"不需要"。

**验证**: `npm run dev` 启动时间 ≤ 200ms（当前水平）

---

## C4: Node.js fetch keep-alive 确认 (P2)

**目标**: 确认 fetch 默认 keep-alive 在 Node.js 18+ 已启用。

Node.js 18+ 的 `fetch` 是基于 `undici` 的，默认启用了 HTTP/1.1 keep-alive（`Connection: keep-alive`）和连接池。**我们当前已经在用了**。

只需要确认未误关：

```typescript
// 检查 fetch 调用是否误传了 connection: close
// 我们的代码中没有设置 Connection header → 保持 undici 默认行为
```

如果 Jina Reader 等外部请求无 keep-alive：Node.js 18 的 `fetch` 默认 keep-alive + 连接池 (max 256 connections per origin)。

**结论**: ✅ 已经是优化的。无需改动。

**验证**: 检查代码中是否有 `headers: { 'Connection': 'close' }` 模式。搜索 `grep -rn 'Connection' src/`

---

# Phase D: 测试与稳定性

> **竞品对标**: 438 tests 已是行业领先，但 brave/tavily 测试缺失
> **核心**: 让 CI 每次跑 500+ tests 且覆盖所有引擎路径

## D1: Brave / Tavily Mock 测试 (P1)

**目标**: 为付费引擎（brave、tavily、exa）添加 mock HTTP 测试。

当前：brave / tavily / exa 单元测试缺失，依赖真实 API key → CI 中无法运行。

**改动清单**:

| 文件 | 操作 | 说明 |
|------|------|------|
| `tests/engines/brave.test.ts` | 新增 | mock fetch 响应 |
| `tests/engines/tavily.test.ts` | 新增 | mock fetch 响应 |
| `tests/engines/exa.test.ts` | 新增 | mock fetch 响应 |

**测试模式**: (vitest mock fetch)

```typescript
import { vi } from 'vitest';

// Mock global fetch before importing the engine
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('Brave engine', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('parses search results correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ web: { results: [{ title: 'Test', url: 'https://test.com', description: 'desc' }] } }),
    });
    const results = await searchBrave('test query', 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Test');
  });

  it('returns empty array on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    const results = await searchBrave('test', 5);
    expect(results).toHaveLength(0);
  });

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const results = await searchBrave('test', 5);
    expect(results).toHaveLength(0);
  });
});
```

**验证**: `npm test` 新增 12+ tests (每引擎 ~4 tests)

---

## D2: free-extract SSRF 安全测试 (P1)

**目标**: 验证 `free_extract` 能正确阻止 SSRF 攻击。

当前：`url-validator.ts` 有 SSRF 保护（阻止私有 IP、localhost、元数据端点）。但 `free_extract` 路径无独立测试覆盖。

**测试用例**:

```
- URL: http://localhost:22
- URL: http://127.0.0.1:3000
- URL: http://169.254.169.254/latest/meta-data/ (AWS metadata)
- URL: https://10.0.0.1/admin
- URL: http://[::1]:8080
- URL: file:///etc/passwd
- URL: data://application/octet-stream
```

**改动清单**:

| 文件 | 操作 |
|------|------|
| `tests/tools/free-extract.test.ts` | 新增 | SSRF 安全测试用例 |

**验证**: `npm test` 新增 7+ tests

---

## D3: E2E 集成测试 (P2)

**目标**: 启动 MCP server → 调用工具 → 验证结果格式 → 关闭。

独立 subprocess 测试，不依赖 vitest（vitest 适合单元测试，E2E 写独立脚本）。

**实现**: `tests/e2e/basic-search.e2e.ts` — 用 vitest 的 `child_process` spawn

```typescript
import { spawn } from 'child_process';
import { resolve } from 'path';

describe('E2E: MCP server stdio mode', () => {
  let proc: ChildProcess;

  afterEach(() => { proc?.kill(); });

  it('responds to initialize request', (done) => {
    proc = spawn('node', [resolve(__dirname, '../../dist/index.js')], { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stdin!.write(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0.0.0' } },
    }) + '\n');
    proc.stdout!.once('data', (data) => {
      const msg = JSON.parse(data.toString());
      expect(msg.id).toBe(1);
      expect(msg.result).toBeDefined();
      done();
    });
  });

  it('lists tools', (done) => { /* ... */ });
  it('calls free_search and returns results', (done) => { /* ... */ }, 15000);
  it('calls free_extract and returns content', (done) => { /* ... */ }, 15000);
});
```

**改动清单**:

| 文件 | 操作 |
|------|------|
| `tests/e2e/basic-search.e2e.ts` | 新增 |

**验证**: `npx vitest run tests/e2e/` 4+ tests passing

---

## D4: DDG HTML 结构变更监控 (P2)

**目标**: 定期验证 DDG HTML 选择器未因前端改版而失效。

cheerio 解析器依赖 CSS 类名（`.result`, `.result__a`, `.result__snippet`），DDG 一次改版全部失效。

**方案 1**: 独立监控脚本 `scripts/check-ddg-html.ts`（不加入主包，仅开发用）

```typescript
// 检查 DDG HTML 结构是否仍可解析
// 如果选择器返回 0 结果，输出警告
```

**方案 2**: 在测试套件中加入隔离的 HTML 结构快照测试（使用已知稳定的 HTML 片段，而非实时请求）

**推荐**: 方案 2 — 不依赖网络，每次 CI 都跑。

**改动清单**:

| 文件 | 操作 |
|------|------|
| `tests/engines/duckduckgo-html.test.ts` | 扩展 | 快照测试 + 结构验证 |

**验证**: `npm test` 新增 3+ tests

---

# On-going: 分发推广

> 这些不阻塞版本发布，但持续做可提升项目影响力。

## O1: awesome-mcp-servers PR

**目标**: 将 agent-search-mcp 加入最大的 MCP 目录站 `punkpeye/awesome-mcp-servers`。

**步骤**:

1. 检查 `https://github.com/punkpeye/awesome-mcp-servers` 的 README 格式
2. 在 Search 分类下添加一行
3. 提 PR

**格式**:
```markdown
- [agent-search-mcp](https://github.com/lennney/agent-search-mcp) - 11-engine free MCP search server with waterfall search, Chinese support, multi-source verification. Zero API keys.
```

---

## O2: 掘金文章

**目标**: 中文开发者社区推广，主题 "npm install 即用的免费 MCP 搜索，11 引擎零配置"

**内容大纲**:
1. MCP 是什么
2. 现有搜索 MCP 的问题
3. agent-search-mcp 的差异化（中文搜索、免费、11 引擎）
4. 快速开始（npm install）
5. 技术架构亮点（瀑布搜索、置信度评分、多源验证）
6. 竞品对比表
7. 未来路线图

**发布渠道**:
- 掘金 (juejin.cn) — 主要
- V2EX — 二次分发
- gh.l-web — 英文版博客

---

## O3: 其他分发

| 渠道 | 操作 | 状态 |
|------|------|------|
| **mcp.directory** | 验证自动收录 | 📋 未确认 |
| **npm search** | 已优化 keywords (23 tags) | ✅ 已完成 |
| **Smithery** | `smithery.yaml` 已配置 | ✅ 已完成 |
| **Glama** | 自动同步 + TDQS 评分 | ✅ 已配置 (等待重扫) |
| **V2EX** | 发布帖 | 📋 未做 |
| **reddit r/mcp** | 发布英文介绍 | 📋 未做 |

---

# 版本规划

| 版本 | 包含内容 | 预计 |
|------|---------|------|
| v3.1.0 | ✅ **已发布** DDGS 独立化、ToolPolicy、TDQS、npm 优化 | 2026-07-22 |
| v3.1.1 | Patch: setupFetchTools 拆分 + bugfix | 1-2 天 |
| v3.2.0 | A2 + A3 + C1 + D1 + D2 | 1 周 |
| v3.3.0 | B1 + B2 + D3 + 持续分发 | 1-2 周 |

> **版本号克制**: patch (3.1.x) 只给 bugfix 和小重构。新增引擎/工具/MCP 工具才 bump minor。
> 每周最多 1 次 publish。

---

# 旧路线图状态 (2026-07-16 → 已完成)

| Phase | 内容 | 状态 | 实际交付 |
|-------|------|------|---------|
| Phase 1 | 快速修复 | ✅ 完成 | 百度摘要、npm 描述、LEARNINGS、badges |
| Phase 2 | MCP 规范 + 架构债务 | ✅ 完成 | SDK ^1.29.0、ToolPolicy、自适应并发 |
| Phase 3 | 中文搜索护城河 | ✅ 完成 | 中文权威源、查询优化、摘要长度 |
| Phase 4 | 答案引擎 | ✅ 完成 | search_with_synthesis (零 LLM) |
| Phase 5 | 扩充免费引擎 | ✅ 完成 | Wikipedia + Startpage |
| Phase 6 | 语言检测 + 搜索扩展 | ✅ 完成 | detectLanguage, rate_limits, Yandex, Mojeek |
| ~~Phase 6~~ | ~~插件系统~~ | 🚫 跳过 | 加引擎比加系统更有价值 |

**成果总结**: 旧路线图从 140 测试→438 测试，4→8 免费引擎，
当前保留 7 个 MCP 工具，4 生产依赖不变。
## 2026-07-26: Agent Search core evidence track

This track belongs to **Agent Search only**. Slim Guard remains a separate
product and is not modified by this work. The integration contract will be
designed after the search entrypoint can expose reliable evidence and failure
semantics on its own.

### P0 - trustworthy execution semantics

- [x] Preserve per-engine outcomes (`success`, `skipped`, `failed`) so fallback
      continues while real upstream failures appear in `partialFailures`.
- [x] Propagate MCP request cancellation through search orchestration, retry
      backoff, rate-limit waits, engine HTTP calls, and content enrichment.
- [x] Stop treating successful content extraction as corroboration: enrichment
      may improve the snippet, but must not add a fixed confidence bonus.
- [x] Use one cache-key contract for parallel and waterfall reads/writes, and
      make waterfall searches consume cached responses.

### P1 - evidence-first retrieval

- [x] Introduce query-aware passage selection and explicit output budgets.
- [x] Separate provenance, relevance, corroboration, freshness, and extraction
      quality instead of compressing them into one opaque score.
- [x] Return compact evidence packets that Slim Guard can later transform
      without losing source or failure metadata.

Evidence: [`docs/evidence/2026-07-26-evidence-packets.md`](../../evidence/2026-07-26-evidence-packets.md).

### P2 - measurable ecosystem contract

- [ ] Add benchmark datasets with adjudicated relevance labels and raw traces.
  - [x] Capture raw response hashes, engine outcomes, latency, and failures.
  - [x] Generate a pending label template without inventing judgments.
  - [x] Add deterministic multi-system URL pooling, provenance-blinded packets,
        completed-review import, and disagreement/adjudication validation.
  - [x] Generate per-system pooled-qrels comparison reports from completed
        adjudication without inferring unmeasured answer correctness.
  - [x] Report pre-adjudication reviewer reliability with raw agreement and
        pairwise kappa without hiding low-agreement queries.
  - [x] Separate completed review evidence from public-claim readiness with
        minimum distinct-query gates overall and per slice.
  - [x] Add deterministic query-paired bootstrap intervals for every system
        pair and require uncertainty reporting for public-claim readiness.
  - [x] Add blinded pointwise AI judging with two independent model families,
        a third-family disagreement adjudicator, and hashed verdict evidence.
  - [ ] Complete two-model AI review and third-model adjudication on a non-empty
        pooled capture.
- [x] Report quality, citation support, latency, and failure transparency as
      separate dimensions; keep answer correctness and tokens per correct
      answer explicitly unmeasured when no synthesized answer exists.
- [x] Define an optional Slim Guard integration contract without making direct
      Agent Search installation depend on the gateway.

### P1.1 - research-informed routing corrections

- [x] Audit current Tavily, Exa, Brave, Firecrawl, DDGS, SearXNG, Vane,
      GPT Researcher, Open Deep Research, and Jina DeepResearch source code.
- [x] Treat upstream provider family, adapter name, relevance, confidence, and
      corroboration as different concepts. DuckDuckGo/Bing no longer create
      false independent corroboration.
- [x] Make explicit engine selection authoritative in parallel as well as
      waterfall mode.
- [x] Require result count, per-result relevance, average confidence, and
      independent provider families before skipping later search batches.
- [x] Return `stop_reason` and the observed quality-gate diagnostics in
      execution metadata.
- [x] Re-evaluate the quality gate after optional API phases before query
      expansion.
- [x] Keep same-provider adapters as sequential failure/low-quality fallbacks
      without letting them create independent corroboration.
- [x] Bound every public and internal `count` path so a zero batch size cannot
      stall waterfall execution.
- [x] Pin provider-family semantics in a machine-readable Slim Guard handoff
      contract and verify runtime/benchmark parity.
- [x] Make an HTML-202/Lite combined DDG failure non-retryable so one MCP
      request cannot repeat the same Lite representation.
- [x] Put filtering, domain policy, deduplication, scoring, and the quality
      gate behind one search-evidence interface shared by parallel and
      waterfall routing. Domain policy now runs before deduplication and uses
      exact host/subdomain matching.
- [x] Expose one shared Search Evidence Packet for primary and advanced search
      through MCP `structuredContent` and `outputSchema`; keep the text channel
      as a compact view instead of a second JSON contract.
- [ ] Calibrate the provisional per-result relevance floor on a non-empty
      pooled capture. It is an internal routing heuristic, not a public
      relevance probability.
  - [x] Preserve protected per-system routing signals and add a deterministic
        completed-qrels calibrator with minimum-sample and label-balance gates.
  - [x] Add a 10-query bilingual evergreen calibration set; keep the parent
        item open until a genuinely multi-system capture completes review.
- [x] Close the semantic-enabled path: each routing checkpoint now validates
      the post-semantic display basket before skipping later free/optional
      phases or query expansion (semantic features remain off by default).
- [x] Deprecate the reserved `free_search_advanced.time_range` field without
      removing it from the compatibility schema. Requests now fail before
      search with a machine-readable `UNSUPPORTED_FILTER` instead of silently
      returning unfiltered results.

### P1.2 - mcp-web-hound research assimilation

- [x] Audit
      [`mcp-web-hound@f468da9`](https://github.com/ilgizar-valiullin/mcp-web-hound/tree/f468da9943952fddc1ed71ca977b18b60f40ca11)
      at source level instead of copying its README feature matrix.
- [x] Correct the transient comparison snapshot: first Git/npm dates, npm
      release count, Node/license boundary, Star/Fork, and the 2026-07-18 to
      2026-07-24 npm download window. Downloads remain package pulls, not users.
- [x] Add the real search-policy diagram, a restrained Star CTA, and a
      capability-based MCP Web Hound comparison to both READMEs.
- [x] Surface the existing `search://health`, `mcp://health/metrics`,
      `search://capabilities`, and HTTP `/health` control plane instead of
      adding a duplicate default-visible MCP `status` tool.
- [x] Add a read-only `fasm doctor` design and implementation:
  - report provider/optional-dependency readiness and config provenance;
  - print only `present` / `missing` / `invalid`, never key or token values;
  - provide `--json` with a stable schema and no implicit config writes;
  - cover secret redaction, Node 18, Windows, and zero-key startup in tests.
- [x] Define one explicit request budget envelope across calls, elapsed time,
      result count, and evidence characters. Exhaustion must return a
      machine-readable reason and observed/limit values, never an empty success.
- [x] Evaluate durable provider cooldown as a replaceable store:
  - classify CAPTCHA, 429, 403, timeout, parse drift, and cancellation
    separately;
  - preserve every skip/failure in `partialFailures`;
  - bind persisted state to provider/failure type with expiry and bounded
    recovery; never persist credentials or query text.
- [x] Prototype persistent exact cache behind an opt-in interface before any
      semantic vector cache:
  - cache keys bind language, strategy, filters, provider-policy version,
    evidence schema, and freshness policy;
  - benchmark install success, cold start, RSS, p95, hit rate, stale/error
    reuse, and eviction on Node 18/20/22 plus Windows/Linux;
  - keep native/vector dependencies out of the default package until all gates
    pass.
- [x] Benchmark deterministic routing against a lightweight intent classifier
      on bilingual docs/news/code/general slices. A classifier is eligible only
      if it changes routing and improves quality without violating latency,
      memory, cancellation, or zero-key startup gates.
  - Outcome: the candidate changes routes but has no completed quality evidence,
    so it remains benchmark-only and is not production-eligible.
- [x] Collect issue/usage evidence before adding GitHub/GitLab search tools.
      Direct code-hosting APIs do not automatically inherit the Web Search
      cache, budget, failure, or evidence contract.
  - Outcome (2026-07-26): package and repository usage exists, but there are no
    issue/discussion or public integration requests for dedicated code-hosting
    search. Keep domain-filtered Web Search plus `fetch_github_readme`; do not
    add GitHub/GitLab tools without new demand evidence.
- [x] Generate the public capability matrix from the engine/tool registry and
      config schema so documentation cannot advertise unregistered tools or
      unused budgets.

Research:
[`docs/research/2026-07-26-agent-search-product-architecture.md`](../../research/2026-07-26-agent-search-product-architecture.md)

### P1.3 - zero-key runner reliability

- [x] Add the page-issued DuckDuckGo Web preload as the first native Node
      representation, with exact HTTPS host/path validation and a stable
      request identity across bootstrap and result fetch.
- [x] Remove the Python/ddgs subprocess path. Use the project-owned
      Web → HTML → Lite chain as same-provider representations without
      increasing `source_count`.
- [x] Classify DDG/Sogou anti-bot responses as `bot_challenge`; suspend the
      provider immediately for a bounded cooldown and retain the failure in
      `partialFailures`.
- [x] Continue Sogou cookies only across trusted HTTPS redirects and reject
      protocol downgrade. The current runner still reaches `/antispider/`;
      do not present this as a parser or API-key failure.
- [x] Add a privacy-preserving runner qualification gate. The 2026-07-26 local
      DDG/Wikipedia adapter probe is ready on 10/10 bilingual queries.
      The gate now exits non-zero for `insufficient-runner`; a later same-day
      retest qualified 8/10 after DDG HTTP 202 challenge/cooldown, so no quality
      capture was produced from that run.
- [x] Add an explicit Node 18.17-compatible Undici proxy transport for DDG and
      Sogou after dependency review. Keep it request-local, redact credentials,
      preserve cancellation, and do not consume ambient proxy variables.
- [x] Add query-sticky, user-owned DDG/Sogou proxy pools at the shared transport
      seam. Fail over only on transport exceptions, cool failed transports for
      60 seconds, and never switch exits after HTTP challenge/403/429 evidence.
- [x] Bind formal competitive execution to a fresh exact-profile qualification
      hash and retain validated provider-level failure attribution in private
      checkpoints. The earlier DDG/Wikipedia-only qualification remains narrow
      evidence and cannot authorize the nine-adapter formal profile.
- [x] Verify the packed Windows `fasm.cmd` entry against live native DDG search,
      and bound fallback query expansion to one generation.
- [ ] Capture a non-empty Sogou fixture from a legitimate alternate exit. Do
      not add fingerprint rotation or challenge-evasion behavior.
- [ ] Capture actual Agent Search and comparison-system results on the qualified
      runner, then run the small blinded AI review. Adapter readiness is not a
      product-quality claim.
  - [x] Keep comparison providers outside runtime: normalize bounded,
        license-disclosed offline exports into the existing traced capture
        contract. Qualification probes use conservative pacing and no
        automatic retries.

Evidence:

- [`docs/evidence/2026-07-26-ddg-html-lite-network-observation.md`](../../evidence/2026-07-26-ddg-html-lite-network-observation.md)
- [`docs/evidence/2026-07-26-p2-quality-pilot.md`](../../evidence/2026-07-26-p2-quality-pilot.md)
- [`docs/evidence/2026-07-26-search-pooling-contract.md`](../../evidence/2026-07-26-search-pooling-contract.md)
- [`docs/research/2026-07-26-search-quality-evaluation.md`](../../research/2026-07-26-search-quality-evaluation.md)
- [`docs/contracts/slim-guard-evidence-handoff-v1.md`](../../contracts/slim-guard-evidence-handoff-v1.md)

### P1.4 - free core, paid quality escalation, and release readiness

产品默认面继续服务零密钥用户。付费渠道只使用用户自带凭证，并且必须由
显式策略启用；配置了凭证不等于授权每次请求产生费用。

#### Routing policy

- [x] 在一个小型路由策略 interface 后实现以下模式，避免各工具分别解释环境变量：
  - `free_first`（默认）：零密钥渠道先行，不自动产生付费调用；
  - `quality_escalation`：免费证据未通过质量门槛时，才调用已配置的付费渠道；
  - `paid_first`：已配置的付费渠道先行，失败或证据不足时回退免费渠道；
  - `free_only`：即使存在 API key 也禁止付费调用。
- [x] 用户显式传入 `engines` 时保持最高优先级；缺少凭证继续返回
      `permission_denied`，不得静默替换为另一个付费渠道。
- [x] 默认可选顺序保留原有 `brave,exa,tavily,youcom` 优先级，并把
      `tencent_wsa,bocha,serper` 追加为显式 BYOK 候选；该顺序不是质量排名，
      只有完成同查询集评测后才能按质量调整。
- [x] 在 `meta.execution` 中记录实际阶段、调用渠道、停止原因和预算耗尽原因；
      不记录 key、查询外的凭证信息或估算账单。
- [x] 经明确授权补充 Wiby 零密钥官方 JSON 源，以及 Tencent WSA、Bocha、
      Serper 三个可选 API；不引入浏览器运行时或新的生产依赖。
      Wiby 只在免费瀑布后段补充小型网页，三个 BYOK 渠道默认不调用。
- [x] Provider family 合同将 Tencent WSA 与 Sogou、Serper 与
      Startpage/Google 保守归并，避免同上游多适配器虚增 `source_count`。
- [x] 使用离线 fixture 验证新增适配器的解析、取消和失败语义。
- [ ] 在单独授权的受控 runner 上比较新渠道；完成 pooled 评测前不宣称它们提高
      准确率或可用率。
- [ ] Perplexity Search 只作为下一付费候选进入离线适配器评测；通过准入门槛且获得
      “增加引擎”授权后，才进入运行时注册表。

#### Bounded E2E policy

联网测试不是默认测试的一部分，且不得为了获得结果规避上游挑战或增加请求频率。

| 层级 | 网络 | 触发方式 | 范围 |
|------|------|----------|------|
| 单元/fixture | 无 | 每次提交 | 所有适配器解析、路由、预算、失败语义 |
| MCP smoke | 无 | 每次提交 | stdio/HTTP 初始化、工具发现、结构化输出、关闭 |
| Live qualification | 有 | 手动或受控 runner | 固定少量查询、单次尝试、保守间隔；只判断 runner 是否合格 |
| Release live smoke | 有 | 发布候选一次 | 1 个英文 + 1 个中文查询；每类只选一个已授权渠道，不做全引擎 fan-out |
| Quality capture | 有 | 独立批准 | 固定查询集、可恢复运行、外部结果离线导入；不与发布 smoke 合并 |

- [x] 为 live E2E 增加请求上限、最小间隔和 `LIVE_E2E=true` 显式开关；缺少开关时
      必须 skip，不得自动联网。
- [ ] 免费 live smoke 不把 DDG/Sogou 同时作为硬发布门槛：挑战响应必须透明记录，
      但单一公共出口被限流不应诱发自动重试。
- [ ] 付费 live smoke 只调用显式选择且存在凭证的一个渠道；测试输出只保留状态、
      延迟、结果数和脱敏错误。

#### Release-candidate gate

历史候选来自 `a1de485`。唯一 tarball 的 SHA-256 为
`002EBC7C7AC7E4B8330C1AB25288CD4DB71917ECBC4C2A5C7CB76BE08BFABAEA`；
该产物只保留作证据，不能发布。当前源码已前进到新的本地检查点，尚未生成新的
release candidate。

- [x] `npm run build`、默认离线测试、lint、能力矩阵漂移检查和冻结 benchmark 全部通过。
- [x] 从当前最终提交生成唯一 tarball；记录 commit、SHA-256、文件数和大小。
- [x] Node 18.17 / 20 / 22 至少完成安装、stdio 初始化和工具发现；Windows 跑打包后的
      `fasm.cmd`，Linux runner 验证包安装与进程退出。
- [x] HTTP 默认认证、Origin allowlist、stdio stdout 纯 JSON-RPC、SSRF 和凭证脱敏门禁通过。
- [x] 使用同一个当前 tarball 完成全部安装 smoke；发布时不得重新打包不同内容。
- [x] 仅当受控 runner 合格时执行一次 bounded release live smoke；不合格时保留报告并停止
      质量声明，不从当前受限出口反复探测。
      本次保留 `73c34969` 的一次有限历史证据。P1 双语请求上下文已改变编排后的
      DDG 请求，因此这份证据不再覆盖当前精确请求链。重新验证必须使用干净出口和
      单独授权，不能复用已触发 challenge 的出口。
- [x] README、CHANGELOG、HANDOVER 和生成能力矩阵与运行时一致；发布说明不宣称未经
      adjudication 的准确率、可用率或付费渠道排名。
- [x] 门禁完成后创建检查点 commit。版本 bump、npm publish、GitHub Release 和推广仍需
      分别获得明确授权。

### P1.5 - provider half-open probe ownership

目标是让 `HealthTracker` 独立拥有 Provider 尝试的原子准入、单个 half-open probe 和
退出释放。编排层只结束 lease，不读取或拼装 circuit 状态。

- [x] 用 `acquireAttempt()` 与幂等 lease 替换分离的 availability 检查和事后记录；
- [x] 证明 half-open 并发最多一个调用进入 Provider，其余调用得到稳定拒绝；
- [x] 覆盖成功、普通失败、challenge suspension、取消、预算拒绝和限速等待失败；
- [x] 保持 `partialFailures`、重试、cooldown 持久化、runtime 隔离和公开输出合同不变；
- [x] 通过定向测试、build、lint、完整离线测试及 quality/format benchmark；
- [x] 本阶段不联网，不增加 Provider、依赖、请求次数或 MCP schema。

详细计划：
[`docs/plans/2026-08-07-provider-half-open-probe-lease.md`](../../plans/2026-08-07-provider-half-open-probe-lease.md)

### P1.6 - bounded bilingual request-context smoke

P1.5 离线门禁通过后，才验证 P1 双语请求上下文的真实出站行为。该阶段仍需用户单独
确认，并且必须使用未触发 DDG/Sogou challenge 的干净出口。

2026-08-08 已完成本阶段。构建后的 runtime dispatcher 对 Wikipedia 英文/中文入口各
调用一次，分别解析为 `en/us-en` 与 `zh/cn-zh`，均返回 3 条；两次间隔至少 10 秒，
没有重试、429、challenge 或原文 artifact。未调用已出现 challenge 的 DDG/Sogou/Yandex。
详细执行合同和脱敏观察见
[`docs/plans/2026-08-08-bounded-bilingual-live-smoke.md`](../../plans/2026-08-08-bounded-bilingual-live-smoke.md)。

- [x] 英文、中文各一条查询，每条只选一个零密钥 Provider，Top-3；
- [x] 串行执行，调用间隔至少 10 秒，单次硬超时，不重试、不 enrichment、不写 artifact；
- [x] 只记录脱敏状态、语言上下文、结果数、延迟和失败类型，不保存结果原文；
- [x] 任何 429 或 challenge 立即停止整轮，不切换出口或追加探测；
- [x] 结果只证明请求上下文和失败合同的时间点可用性，不形成质量或可用率声明；
- [x] 该阶段不授权 30-query × 3-system capture，后者仍需独立批准。

---
