# ddgs 独立化 — 消除 Python 硬依赖

> **目标**: 让 agent-search-mcp 不再强制依赖 Python + ddgs，Windows 用户原生可用，npm install 即开即用。
>
> **路线**: Phase 1（优雅降级，低风险 → 快速改善体验）→ Phase 2（Node.js 原生 DDG 引擎，消除 Python 依赖）

---

## 背景

```
agent-search-mcp
├── Sogou   ── fetch (HTTP)        ✅ 纯 Node.js
├── Bing    ── fetch (HTTP)        ✅ 纯 Node.js
├── Baidu   ── fetch (HTTP)        ✅ 纯 Node.js
├── Brave   ── fetch (HTTP)        ✅ 纯 Node.js (需 API key)
└── DDG ── subprocess → python → ddgs  ❌ 唯一 Python 依赖
```

**问题**: DuckDuckGo 是唯一一个通过 Python subprocess 调用的引擎。用户 `npm install -g agent-search-mcp` 后还得额外 `pip install ddgs`。Windows 上 Python 不是标配，基本等于 DDG 引擎不可用。

---

## Phase 1 — 优雅降级（小改动，低风险）

> **目标**: 让 ddgs 不可用时用户能清楚知道，而非静默返回空结果。
>
> **估算**: 半天

### 改动清单

#### 1. `src/engines/duckduckgo.ts`

- 将 `findPython()` 从每次调用改为惰性检测（只跑一次，缓存结果）
- 导出 `isDdgsAvailable: boolean` 供 health 端点使用
- 失败时日志从 `console.error` 改为 logger.warn，归入 `partialFailures`

关键变动:

```typescript
// 改为惰性初始化
let _pythonBin: string | null = null;
let _ddgsChecked = false;

function getPythonBin(): string | null {
  if (_ddgsChecked) return _pythonBin;
  _ddgsChecked = true;
  // ...原有候选路径检测...
  return _pythonBin;
}

export function isDdgsAvailable(): boolean {
  return getPythonBin() !== null;
}
```

#### 2. `src/infrastructure/health.ts`

在 DDG provider 健康报告中增加 ddgs 可用性：

```typescript
// duckduckgo provider health 加字段
{ provider: "duckduckgo", ddgs_available: true/false, python_path: string|null }
```

#### 3. `src/tools/free-search.ts` — `searchEngine()` 函数

DDG 失败时注入 `partialFailures`：

```typescript
// searchEngine 中 catch block
if (engine === 'duckduckgo') {
  const unavailable = !isDdgsAvailable();
  if (unavailable) {
    // 在 partialFailures 中加入提示
  }
}
```

#### 4. 更新文档

- **AGENTS.md**: 更新已知陷阱，说明 ddgs 可选依赖
- **README.md**: 安装部分增加 Windows 说明

---

## Phase 2 — Node.js 原生 DDG 引擎（消除 Python）

> **目标**: 完全去掉 Python subprocess 路径，DDG 引擎直接用 Node.js + fetch 实现。
>
> **估算**: 1-2 天

### 核心方案

DuckDuckGo 的 `ddgs` Python 库核心就是：
1. 发 HTTP GET → `https://html.duckduckgo.com/html/?q=<query>`
2. 解析 HTML → 提取 class="result" 的条目

Node.js 等效：

```typescript
// src/engines/duckduckgo-html.ts
import * as cheerio from 'cheerio';

export async function searchDuckDuckGoHtml(query: string, limit = 10): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; agent-search-mcp/3.x)' },
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const results: SearchResult[] = [];
  $('.result').each((i, el) => {
    if (i >= limit) return false;
    results.push({
      title: $(el).find('.result__title').text().trim(),
      url: $(el).find('.result__url').attr('href') || '',
      snippet: $(el).find('.result__snippet').text().trim(),
      source: 'duckduckgo',
      engines: ['duckduckgo'],
    });
  });
  return results;
}
```

### 依赖

```bash
npm install cheerio
```

cheerio ≈ 3 个生产依赖，比现有的 Python + ddgs 轻得多。

### 文件变动

| 操作 | 文件 | 说明 |
|------|------|------|
| **新增** | `src/engines/duckduckgo-html.ts` | Node.js 原生 DDG 引擎 |
| **改造** | `src/engines/duckduckgo.ts` | 保留 Python 路径为首选，fallback 到 HTML 引擎 |
| **删除** | `scripts/ddg-search.py` | 归档，不再需要 |
| **删除** | `scripts/ddg-news-search.py` | 归档，不再需要 |
| **改造** | `Dockerfile` | 去掉 python3 + pip + ddgs 安装 |
| **更新** | `README.md` | 去掉 pip install ddgs 要求 |
| **更新** | `AGENTS.md` | 更新已知陷阱 |

### fallback 策略

```
searchDuckDuckGo(query) 被调用
  ├─ Python+ddgs 可用 → 使用 Python 路径（稳定优先）
  └─ 不可用 → 自动 fallback 到 Node.js HTML 引擎
```

保留 Python 路径作为首选，是因为 ddgs 对接的是 DDG 的内部 API（更稳定），HTML 解析更容易被前端改版影响。

### Dockerfile 变化

```diff
 FROM node:20-slim AS runtime
 WORKDIR /app
-RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && \
-    pip3 install ddgs --break-system-packages && \
-    rm -rf /var/lib/apt/lists/*
 COPY --from=build /app/dist ./dist
 COPY --from=build /app/node_modules ./node_modules
 COPY --from=build /app/package*.json ./
```

去掉 python3 + pip install ddgs → 镜像更小、构建更快、架构无关（arm/v7 也不用担心 pip 兼容性）。

---

## 路线图

```
Phase 1 ──→ 优雅降级 + 健康报告                 [半天]  ← 立即可以干
  │
  └──→ Windows/Docker 用户至少知道 DDG 不可用
  └──→ partialFailures 能正确展示
  └──→ 文档更新

Phase 2 ──→ Node.js 原生 DDG 引擎               [1-2天] ← DDG 反爬稳定后
  │
  └──→ cheerio 替代 python3 + ddgs
  └──→ Dockerfile 瘦身
  └──→ Windows 原生支持 npm install
  └──→ 脚本归档
```

---

## 风险

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| DDG HTML 结构改版 | 中 | Phase 2 的 HTML 引擎失效 | Phase 2 保留 Python 路径为首选，HTML 为 fallback |
| ddgs Python 库废弃 | 低 | Phase 1 的首选路径失效 | 过渡到 Phase 2 后就不依赖了 |
| cheerio 解析性能 | 低 | HTML 引擎比 Python 慢 | Python 路径仍是首选，仅在不可用时 fallback |

---

## 完成检查清单

### Phase 1

- [ ] `duckduckgo.ts`: findPython 改为惰性检测
- [ ] `duckduckgo.ts`: 导出 `isDdgsAvailable()`
- [ ] `health.ts`: DDG 健康报告含 `ddgs_available`
- [ ] `free-search.ts`: DDG 失败时注入 partialFailures
- [ ] AGENTS.md + README 更新

### Phase 2

- [ ] `src/engines/duckduckgo-html.ts` — Node.js 原生实现
- [ ] `src/engines/duckduckgo.ts` — Python 优先 → HTML fallback
- [ ] `scripts/ddg-search.py` 归档到 `.hermes/archive/`
- [ ] `scripts/ddg-news-search.py` 归档
- [ ] `Dockerfile` 去掉 Python 安装
- [ ] `npm install cheerio`
- [ ] `npm test` 全通过
- [ ] README 去掉 pip install ddgs
- [ ] AGENTS.md 更新已知陷阱
