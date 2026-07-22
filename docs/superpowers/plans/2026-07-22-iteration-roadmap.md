# agent-search-mcp 迭代路线图 — v3.1.0 → v3.2.0

> **状态**: v3.1.0 已发布。11 引擎、DDGS 独立化、工具可见性控制、TDQS 修复全部完成。
> **旧 6 阶段路线图** (2026-07-16): ✅ Phase 1-6 全部完成 — 见尾部"旧路线图状态"表。
> **本篇为新路线图**: 基于竞品调研和 v3.1.0 状态制定的 4 个迭代方向 + 持续分发。

---

## 路线图概览

```
           v3.1.0
        (当前发布)
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
           v3.2.0 目标发布
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

## C1: DDG News HTML 回退 (P0)

**目标**: `searchDuckduckgoNews()` 在无 Python 时返回结果而非空数组。

当前：`searchDuckduckgoNews()` 在 `getPythonBin() === null` 时直接 `return []`。

参照 `duckduckgo-html.ts` `searchDuckDuckGoHtml()` 模式，实现 News HTML 版本。

DDG News URL: `https://html.duckduckgo.com/html/?q=...`（与 web 搜索同端点，但渲染新闻卡片）

或者：`https://duckduckgo.com/news` 的 HTML 结构。

**改动清单**:

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/engines/duckduckgo-html.ts` | 扩展 | 新增 `searchDuckDuckGoNewsHtml()` |
| `src/engines/duckduckgo.ts` | 修改 | `searchDuckduckgoNews()` Python 不可用时调用 HTML 回退 |
| `tests/engines/duckduckgo-html.test.ts` | 扩展 | News HTML 测试用例 |
| `tests/tools/free-search-ddg-unavailable.test.ts` | 扩展 | News 回退测试 |

**关键实现**: DDG News 无专用 HTML 端点。新闻搜索需从通用 HTML 结果中过滤 news 类结果，或参考 `gh.franksnyder` 的 DDG News API 封装。

**测试**: vitest — mock DDG News HTML 响应，验证回退路径正确 (+10-15 tests)

**验证**: `npm test` ✅, 模拟无 Python 环境验证 News 可搜

---

## C2: `lite.duckduckgo.com` 第三层回退 (P1)

**目标**: 当 `html.duckduckgo.com` 返回 202 (限流) 时，用 Lite 端点救火。

DDG Lite: `https://lite.duckduckgo.com/lite/` — 极简 HTML 版，反爬更少。

Lite HTML 结构不同：
- 结果 class: `.result-link` (标题) / `.result-snippet` (摘要)
- 无 JavaScript，纯表格布局
- 限流策略更宽松

**改动清单**:

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/engines/duckduckgo-html.ts` | 扩展 | 新增 `searchDuckDuckGoLiteHtml()` |
| 同上 | 修改 | `searchDuckDuckGoHtml()` 失败 202 时自动 fallback |
| `tests/engines/duckduckgo-html.test.ts` | 扩展 | Lite 路径测试 |

**回退链**: Python ddgs → cheerio HTML → Lite HTML → 空数组

**测试**: vitest — mock Lite HTML 响应 + 202 触发回退验证 (+5-8 tests)

**验证**: `npm test` ✅

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
| Phase 6 | 语言检测 + 新闻搜索 | ✅ 完成 | detectLanguage, rate_limits, news search, Yandex, Mojeek |
| ~~Phase 6~~ | ~~插件系统~~ | 🚫 跳过 | 加引擎比加系统更有价值 |

**成果总结**: 旧路线图从 140 测试→438 测试，4→8 免费引擎，6→8 MCP 工具，4 生产依赖不变。
