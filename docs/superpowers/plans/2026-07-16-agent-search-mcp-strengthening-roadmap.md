# agent-search-mcp 强化路线图 — 阶段性实现计划

> **⚠️ 已废弃**: 旧 6 阶段路线图（Phase 1-6 全部完成）。新路线图见 [2026-07-22-iteration-roadmap.md](2026-07-22-iteration-roadmap.md)。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 分 6 个阶段强化 agent-search-mcp：快速修复 → MCP 规范合规 → 中文护城河 → 答案引擎 → 语义搜索 + 浏览器提取 → 插件系统 + 实体搜索。每个 Phase 独立可测。

**Architecture:** 各 Phase 独立子系统，Phase 1 是低风险修复；Phase 2 适配 2026-07-28 MCP 规范；Phase 3 加固中文搜索护城河；Phase 4 新增 LLM 答案引擎与 Tavily 竞争；Phase 5 加入 Playwright 提取 + 本地嵌入排序；Phase 6 做插件系统 + 实体搜索。

**注意：版本号不频繁更新，只有真正发布 npm 时才改。开发期间在 CHANGELOG 顶部 `[Unreleased]` 区记录变更即可。**

**Tech Stack:** TypeScript strict, Node.js >=18, @modelcontextprotocol/sdk, Zod, Pino, Vitest, Python ddgs

---

## Phase 总览

```
Phase 1: 快速修复（1-2天）
  ├── 百度引擎摘要提取
  ├── npm 描述更新
  ├── LEARNINGS.md 填充
  └── GitHub topics + badges
        ↓
Phase 2: MCP 规范 + 架构债务（3-5天）
  ├── 2026-07-28 规范适配（SDK 升级、错误码、resultType、缓存语义）
  ├── 工具 allow/denylist（P1）
  ├── 自适应并发（P2）
  └── 集成测试基础
        ↓
Phase 3: 中文搜索护城河（2-3天）
  ├── 中文权威源加权（百度百科、知乎、CSDN）
  ├── 中文查询优化（分词、繁简转换）
  └── 中文结果摘要长度适配
        ↓
Phase 4: 答案引擎 v3.1.0（3-5天）
  ├── search_with_synthesis 工具
  ├── LLM 总结层（多源结果 → 结构化答案）
  └── 引用追踪 + 置信度标注
        ↓
Phase 5: 语义搜索 + Playwright（4-6天）
  ├── Playwright 浏览器提取（替代 Jina Reader）
  ├── 本地嵌入模型二次排序
  └── free_extract 增强
        ↓
Phase 6: 插件系统 + 实体搜索（5-7天）
  ├── 自定义引擎插件接口
  ├── 人物/公司/代码实体搜索
  └── 文档站点 + 示例插件
```

---

# Phase 1: 快速修复

> **For agentic workers:** This phase is the detailed plan. Each task is bite-sized (2-5 min). TDD, frequent commits.

**Goal:** 修复 4 个低投入高回报的问题，让项目在 npm/GitHub 上的展示更专业。

**Architecture:** 纯修复，无架构变更。百度引擎加 HTML 正则解析；npm 描述更新到 v2.2.2 功能集；LEARNINGS.md 从 CHANGELOG 和 AGENTS.md 提取踩坑记录；GitHub 添加 topics 和 badges。

**Tech Stack:** TypeScript, HTML regex parsing, npm CLI, GitHub API

---

## Phase 1 文件结构

```
src/engines/baidu.ts          ← 修改：新增摘要提取逻辑
package.json                  ← 修改：更新 description
README.md                     ← 修改：加 badges
README_zh.md                  ← 修改：加 badges
LEARNINGS.md                  ← 修改：填充踩坑记录
```

---

### Task 1: 百度引擎摘要提取

**Files:**
- Modify: `src/engines/baidu.ts`
- Test: `tests/engines/baidu.test.ts`

Baidu HTML 搜索结果结构：
```html
<div class="result c-container">
  <h3 class="t"><a>标题</a></h3>
  <div class="c-abstract">摘要内容...</div>
  <span class="c-showurl">url</span>
</div>
```

或者新版结构：
```html
<div class="c-container">
  <h3><a>标题</a></h3>
  <span class="content-right_8Zs40">摘要</span>
</div>
```

- [ ] **Step 1: 写百度摘要提取的失败测试**

在 `tests/engines/baidu.test.ts` 添加测试：

```typescript
describe('Baidu HTML parser', () => {
  it('extracts title, url, and snippet from classic Baidu HTML', () => {
    const html = `
      <div class="result c-container">
        <h3 class="t"><a href="https://example.com/page1">Example Title One</a></h3>
        <div class="c-abstract">This is the snippet text for result one.</div>
        <span class="c-showurl">example.com</span>
      </div>
      <div class="result c-container">
        <h3 class="t"><a href="https://example.com/page2">Example Title Two</a></h3>
        <div class="c-abstract">Another snippet here.</div>
        <span class="c-showurl">example.com</span>
      </div>
    `;
    const results = parseBaiduHTML(html);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Example Title One');
    expect(results[0].url).toBe('https://example.com/page1');
    expect(results[0].snippet).toBe('This is the snippet text for result one.');
    expect(results[1].title).toBe('Example Title Two');
    expect(results[1].snippet).toBe('Another snippet here.');
  });

  it('extracts snippet from new-style Baidu HTML', () => {
    const html = `
      <div class="c-container">
        <h3><a href="https://example.com/page">New Style Title</a></h3>
        <span class="content-right_8Zs40">New style snippet content.</span>
      </div>
    `;
    const results = parseBaiduHTML(html);
    expect(results[0].snippet).toBe('New style snippet content.');
  });

  it('returns empty snippet when no snippet element found', () => {
    const html = `
      <div class="result c-container">
        <h3 class="t"><a href="https://example.com/ns">No Snippet Title</a></h3>
      </div>
    `;
    const results = parseBaiduHTML(html);
    expect(results[0].snippet).toBe('');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /Users/macbook1/object/agent-search-mcp
npx vitest run tests/engines/baidu.test.ts
```

Expected: `parseBaiduHTML is not defined` — 3 tests FAIL.

- [ ] **Step 3: 导出 parseBaiduHTML 并在搜索引擎中实现摘要提取**

修改 `src/engines/baidu.ts`，当前代码大致为：

```typescript
// 现有代码（假设结构）
export async function searchBaidu(query: string, count: number): Promise<SearchResult[]> {
  const html = await fetchBaiduHTML(query, count);
  return parseBaiduHTML(html);
}

function parseBaiduHTML(html: string): SearchResult[] {
  // 当前只提取标题和 URL，snippet 为空
  const results: SearchResult[] = [];
  const itemRegex = /<h3[^>]*class="t"[^>]*>.*?<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>.*?<\/h3>/gs;
  let match;
  while ((match = itemRegex.exec(html)) !== null) {
    results.push({
      title: stripHtml(match[2]),
      url: match[1],
      snippet: '',  // ← 目前是空的！
      source: 'baidu',
    });
  }
  return results;
}
```

修改为：

```typescript
import { SearchResult } from '../types.js';
import { httpClient } from '../infrastructure/http.js';
import { logger } from '../infrastructure/logger.js';

// 导出供测试使用
export { parseBaiduHTML };

/**
 * Parse Baidu HTML search results.
 * Supports both classic (.result.c-container) and new-style (.c-container) layouts.
 */
export function parseBaiduHTML(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Match each result block: classic or new style
  const blockRegex = /<div[^>]*class="[^"]*(?:result\s+)?c-container[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*(?:result\s+)?c-container|$)/gi;
  let blockMatch;
  while ((blockMatch = blockRegex.exec(html)) !== null) {
    const block = blockMatch[1];

    // Title + URL: <h3 class="t"> or <h3> with <a>
    const titleMatch = block.match(/<h3[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/is);
    if (!titleMatch) continue;

    const url = titleMatch[1];
    const title = stripHtml(titleMatch[2]);

    // Snippet: try multiple patterns
    let snippet = '';

    // Pattern 1: classic .c-abstract
    const abstractMatch = block.match(/<[^>]*class="c-abstract"[^>]*>([\s\S]*?)<\/\w+>/i);
    if (abstractMatch) {
      snippet = stripHtml(abstractMatch[1]);
    }

    // Pattern 2: new-style content-right_*
    if (!snippet) {
      const contentMatch = block.match(/<[^>]*class="[^"]*content-right_\w+[^"]*"[^>]*>([\s\S]*?)<\/\w+>/i);
      if (contentMatch) {
        snippet = stripHtml(contentMatch[1]);
      }
    }

    // Pattern 3: generic <span> with meaningful text fallback
    if (!snippet) {
      const fallbackMatch = block.match(/<span[^>]*>([\s\S]{20,200}?)<\/span>/i);
      if (fallbackMatch) {
        const text = stripHtml(fallbackMatch[1]).trim();
        if (text.length > 10) {
          snippet = text;
        }
      }
    }

    results.push({
      title: title.trim(),
      url,
      snippet: snippet.trim(),
      source: 'baidu',
    });
  }

  return results;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchBaidu(query: string, count: number): Promise<SearchResult[]> {
  const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${count}`;

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Accept': 'text/html,application/xhtml+xml',
  };

  const response = await httpClient.get(searchUrl, { headers });
  const html = response.data as string;

  const results = parseBaiduHTML(html);
  logger.info({ engine: 'baidu', count: results.length }, 'Baidu search completed');
  return results.slice(0, count);
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /Users/macbook1/object/agent-search-mcp
npx vitest run tests/engines/baidu.test.ts
```

Expected: ALL 3+ tests PASS.

- [ ] **Step 5: 运行全量测试确保无回归**

```bash
npx vitest run
```

Expected: 143+ tests PASS (从 140 增加到 143+).

- [ ] **Step 6: Commit**

```bash
git add src/engines/baidu.ts tests/engines/baidu.test.ts
git commit -m "feat(baidu): add snippet extraction for Baidu search results"
```

---

### Task 2: npm 描述更新

**Files:**
- Modify: `package.json`

当前 description:
```
"Lightweight MCP search server with free DuckDuckGo + Sogou engines, optional Brave + Tavily paid engines, deduplication, scoring, and caching"
```

- [ ] **Step 1: 更新 package.json description**

修改 `package.json` 第 4 行：

```json
"description": "Free multi-engine MCP search server — 7 engines (DDG, Sogou, Bing, Baidu, Brave, Tavily, Exa), waterfall progressive search, multi-source verification, content enrichment, and CLI. Zero API keys needed.",
```

- [ ] **Step 2: 验证 JSON 格式**

```bash
cd /Users/macbook1/object/agent-search-mcp
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "docs: update npm description to reflect v2.2.2 feature set"
```

---

### Task 3: LEARNINGS.md 填充

**Files:**
- Modify: `LEARNINGS.md`

- [ ] **Step 1: 从 CHANGELOG 和 AGENTS.md 提取踩坑记录，写入 LEARNINGS.md**

用以下内容替换 `LEARNINGS.md`：

```markdown
# LEARNINGS.md — Agent Search MCP

> Agent 每次任务后自动追加，不需要手动维护

## 踩坑记录

## 2026-07-08: Baidu 引擎只有标题没有摘要
- **问题**: Baidu 搜索结果 snippet 字段始终为空，中文搜索结果质量受损
- **原因**: HTML 解析只匹配了 h3.t > a 提取标题和 URL，未解析 c-abstract 摘要区域
- **解决**: 新增多模式摘要提取——classic `.c-abstract`、新版 `.content-right_*`、span 兜底
- **规则**: 每次加引擎必须验证 title + url + snippet 三个字段都有值

## 2026-07-03: CLI 二进制命名冲突
- **问题**: CLI 二进制从 asm → fas → fasm 改了三次
- **原因**: asm 与汇编语言关联冲突；fas 太通用
- **解决**: 最终定名 fasm (Free Agent Search MCP)
- **规则**: CLI 命名先在 npm 搜索是否已被占用

## 2026-06-27: DDG 反爬导致搜索失败
- **问题**: 直接 HTTP 请求 DuckDuckGo 返回空结果或验证页面
- **原因**: DDG 检测到非浏览器 User-Agent 触发反爬
- **解决**: 切换到 Python `ddgs` 库作为后端（子进程调用），绕过反爬检测
- **规则**: 免费搜索引擎优先用官方库/API，直接 HTTP 抓取作为最后手段

## 2026-06-22: stdout 污染 JSON-RPC
- **问题**: console.log 输出混入 MCP JSON-RPC 流，导致客户端解析失败
- **原因**: MCP 协议通过 stdout 传输 JSON-RPC，任何其他 stdout 输出都会破坏协议
- **解决**: 所有日志切换到 pino 写 stderr；CLI 模式单独处理
- **规则**: MCP stdio 模式下永远不写 stdout（除 JSON-RPC 框架输出外）

## 架构发现

### 瀑布搜索的置信度篮子设计
- 3 阶段搜索（DDG+Sogou → Bing+Baidu → Brave+Tavily+Exa）
- 每阶段后检查 Top-5 结果的平均置信度
- 达标（≥0.6）则停止后续阶段，节省 50-75% 引擎调用
- 关键权衡：搜索结果数量 vs 质量。篮子大小（topK=5）经过调优

### 多引擎权重设计
- 不是简单计数（3 个引擎返回 > 2 个引擎返回）
- 而是加权和：Brave(0.95) + Exa(0.92) 的置信度高于 Sogou(0.80) + Baidu(0.75)
- 权重反映引擎的索引质量和结果精准度

### 中文搜索双引擎策略
- Sogou: 对微信生态、中文论坛覆盖好
- Baidu: 对百度百科、贴吧、知道覆盖好
- 两者互补，单一引擎的中文覆盖率有限

### 请求合并模式
- 相同查询在 100ms 内的并发请求自动合并（in-flight dedup）
- 避免 LLM agent 的并行工具调用产生重复搜索
- 实现: Map<collapseKey, Promise<SearchResponse>>
```

- [ ] **Step 2: Commit**

```bash
git add LEARNINGS.md
git commit -m "docs: populate LEARNINGS.md with lessons from v1.0.0 to v2.2.2"
```

---

### Task 4: GitHub README Badges + Topics

**Files:**
- Modify: `README.md`
- Modify: `README_zh.md`

- [ ] **Step 1: 在 README.md 头部加 badges**

在 `README.md` 第 3-9 行（现有 badges 之后）追加：

```markdown
[![npm version](https://img.shields.io/npm/v/agent-search-mcp)](https://www.npmjs.com/package/agent-search-mcp)
[![npm downloads](https://img.shields.io/npm/dm/agent-search-mcp)](https://www.npmjs.com/package/agent-search-mcp)
[![MCP Protocol](https://img.shields.io/badge/MCP-2024--11--05-blue)](https://modelcontextprotocol.io)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![License](https://img.shields.io/github/license/lennney/agent-search-mcp)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-143%20passing-brightgreen)](https://github.com/lennney/agent-search-mcp)
```

- [ ] **Step 2: 在 README_zh.md 同步更新 badges**

```markdown
[![npm version](https://img.shields.io/npm/v/agent-search-mcp)](https://www.npmjs.com/package/agent-search-mcp)
[![npm downloads](https://img.shields.io/npm/dm/agent-search-mcp)](https://www.npmjs.com/package/agent-search-mcp)
[![MCP Protocol](https://img.shields.io/badge/MCP-2024--11--05-blue)](https://modelcontextprotocol.io)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![License](https://img.shields.io/github/license/lennney/agent-search-mcp)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-143%20passing-brightgreen)](https://github.com/lennney/agent-search-mcp)
```

- [ ] **Step 3: 添加 GitHub topics**

在 GitHub 仓库页面 Settings → Topics 添加：
```
mcp-server, web-search, ai-agent, free, duckduckgo, sogou, bing, baidu, brave, tavily, exa, multi-engine, typescript, claude-code, cursor
```

- [ ] **Step 4: 验证**

```bash
cd /Users/macbook1/object/agent-search-mcp
npm test  # 确保无回归
```

- [ ] **Step 5: Commit**

```bash
git add README.md README_zh.md
git commit -m "docs: add npm/MCP badges to README"
```

---

## Phase 1 完成检查清单

- [ ] `npm test` 全部通过（143+ tests）
- [ ] `npm run build` 成功
- [ ] Baidu 搜索结果 .snippet 字段非空
- [ ] package.json description 反映最新功能
- [ ] LEARNINGS.md 包含 5+ 条踩坑记录
- [ ] README badges 正确显示

---

# Phase 2: MCP 规范合规 + 架构债务

> **状态：里程碑描述** — 到达此 Phase 时展开详细 plan

**目标：**
1. 适配 2026-07-28 MCP 规范（SDK 升级、resultType、缓存语义、错误码 -32602）
2. 工具 allow/denylist（企业部署需要限制可用引擎）
3. 自适应并发（BATCH_SIZE 从硬编码改为动态）
4. 加入集成测试（真实网络 E2E）

**预估文件变更：**
- 升级 `@modelcontextprotocol/sdk` 版本
- 修改 `src/index.ts` — resultType, 缓存头
- 新增 `src/infrastructure/tool-policy.ts` — allow/denylist 逻辑
- 修改 `src/infrastructure/config.ts` — 新环境变量
- 修改 `src/tools/free-search.ts` — 自适应 BATCH_SIZE
- 新增 `tests/e2e/search.test.ts` — 集成测试
- 修改 `tests/` 下相关测试文件

---

# Phase 3: 中文搜索护城河

> **状态：里程碑描述** — 到达此 Phase 时展开详细 plan

**目标：**
1. 中文权威源加权：百度百科 (+0.15)、知乎 (+0.10)、CSDN (+0.05)
2. 中文查询自动优化：分词后生成变体查询、繁简自动转换
3. 中文结果摘要长度：从 200 字符增加到 300 字符

**预估文件变更：**
- 修改 `src/aggregation/scorer.ts` — DOMAIN_AUTHORITY 扩展中文站点
- 修改 `src/aggregation/format.ts` — 中文摘要长度判断
- 新增 `src/aggregation/chinese-optimizer.ts` — 分词 + 繁简转换
- 修改 `tests/aggregation.test.ts` — 中文域名权威测试
- 新增 `tests/chinese-optimizer.test.ts`

---

# Phase 4: 答案引擎 v3.1.0

> **状态：里程碑描述** — 到达此 Phase 时展开详细 plan

**目标：**
1. 新增 `search_with_synthesis` MCP 工具
2. 多源搜索结果 → LLM 结构化答案（摘要 + 引用 + 置信度）
3. 支持配置 LLM provider（OpenAI / Anthropic / 本地模型）

**架构设计思路：**
```
search_with_synthesis(query)
  → 瀑布搜索（复用现有）→ 多源结果
  → 拼接上下文（标题 + 摘要 + URL + 置信度）
  → LLM 总结（系统提示词 + 结构化输出）
  → 返回 { answer, citations[], confidence }
```

**预估文件变更：**
- 新增 `src/tools/search-with-synthesis.ts` — MCP 工具注册
- 新增 `src/synthesis/llm-client.ts` — LLM 调用抽象层
- 新增 `src/synthesis/prompt-builder.ts` — 提示词构建
- 新增 `src/infrastructure/llm-config.ts` — LLM 配置
- 新增 `tests/synthesis/` 目录
- 修改 `src/index.ts` — 注册新工具

---

# Phase 5: Playwright 提取 + 本地嵌入排序

> **状态：里程碑描述** — 到达此 Phase 时展开详细 plan

**目标：**
1. Playwright 浏览器提取替代 Jina Reader（处理 JS 渲染页面）
2. 本地轻量嵌入模型（all-MiniLM-L6-v2）对搜索结果二次排序
3. `free_extract` 增强：支持 JS 渲染、截图、结构化数据提取

**预估文件变更：**
- 新增 `src/extraction/playwright-extractor.ts` — 浏览器提取
- 新增 `src/aggregation/embedding-reranker.ts` — 嵌入排序
- 修改 `src/aggregation/enricher.ts` — 增加 Playwright 路径
- 修改 `src/tools/free-extract.ts` — 新参数
- 新增 `tests/extraction/`
- 新增 `python` 依赖（sentence-transformers）

---

# Phase 6: 插件系统 + 实体搜索

> **状态：里程碑描述** — 到达此 Phase 时展开详细 plan

**目标：**
1. 自定义搜索引擎插件接口（任何人可写 npm 包接入）
2. 人物搜索（LinkedIn、Crunchbase）、公司搜索、代码搜索（GitHub code search）
3. 文档站点 + 2 个示例插件

**预估文件变更：**
- 新增 `src/plugins/engine-plugin-interface.ts` — 插件接口定义
- 新增 `src/plugins/plugin-loader.ts` — 插件发现与加载
- 新增 `src/engines/entity-people.ts` / `entity-company.ts` / `entity-code.ts`
- 新增 `src/tools/search-entity.ts` — 实体搜索工具
- 修改 `src/engines/index.ts` — 动态注册
- 修改 `src/index.ts` — 插件加载

---

## 跨 Phase 通用规则

1. **每个 Phase 结束时**：`npm test` 全通过、`npm run build` 成功、CHANGELOG `[Unreleased]` 区更新、README 更新
2. **commit 格式**：`type(scope): 描述`（feat/fix/docs/chore）
3. **测试要求**：新功能 80%+ 覆盖率，关键路径 100%
4. **引擎模式**：每个新引擎独立文件 `src/engines/{name}.ts`
5. **MCP 工具模式**：每个新工具独立文件 `src/tools/{name}.ts`
6. **版本号**：不频繁 bump。所有变更记在 CHANGELOG 顶部 `[Unreleased]` 区。真正发布 npm 时才决定版本号。

---

## 阶段规划

| Phase | 内容 | 状态 | 核心交付 |
|-------|------|------|---------|
| Phase 1 | 快速修复 | ✅ 完成 | 百度摘要、npm 描述、LEARNINGS、badges |
| Phase 2 | MCP 规范 + 架构债务 | ✅ 完成 | SDK 升级、allow/denylist、自适应并发 |
| Phase 3 | 中文搜索护城河 | ✅ 完成 | 中文权威源、查询优化、摘要长度适配 |
| Phase 4 | 答案引擎 | ✅ 完成 | search_with_synthesis（纯数据 + prompt_hint，零 LLM） |
| Phase 5 | 扩充免费引擎 | ✅ 完成 | Wikipedia + Startpage（9 引擎总计） |
| Phase 6 | 语言检测 + 速率限制 + 新闻搜索 + 引擎 | ✅ 完成 | detectLanguage, rate_limits, free_search_news, Yandex, Mojeek（11 引擎） |
| ~~Phase 6~~ | ~~插件系统 + 实体搜索~~ | 🚫 跳过 | 过度设计，ddgs 参考表明加引擎比加系统更有价值 |

**最终结果**: 140 → 235 tests, 4 → 8 免费引擎, 6 → 8 MCP 工具, 依赖数不变（4 个）
