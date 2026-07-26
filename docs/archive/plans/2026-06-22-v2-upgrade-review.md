# Implementation Plan Review: 2026-06-22-v2-upgrade.md

**Reviewer:** Hermes Agent  
**Date:** 2026-06-22  
**Verdict:** **REQUEST_CHANGES**

---

## 12-Criteria Checklist

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Task granularity (2-5 min each) | ✅ PASS | 7 tasks, each well-scoped with 5 steps |
| 2 | File paths (exact, not vague) | ✅ PASS | All paths explicit and correct |
| 3 | Code examples (complete, copy-pasteable) | ❌ FAIL | Missing imports in Task 1.3; missing engine intregration in free-search.ts |
| 4 | Commands (exact with expected output) | ✅ PASS | All commands complete with expected pass/fail |
| 5 | TDD (test first, code second) | ✅ PASS | Every task has Step 1 (test) before Step 3 (code) |
| 6 | Verification steps (prove each task works) | ⚠️ PARTIAL | HTTP test doesn't actually test HTTP behavior; engine tests don't test parsing |
| 7 | DRY (no unnecessary repetition) | ❌ FAIL | `decodeHTMLTags` duplicated across Bing and Baidu |
| 8 | YAGNI (nothing over-engineered) | ✅ PASS | Scope appropriate for v2 upgrade |
| 9 | Missing context (can implement without guessing?) | ❌ FAIL | Multiple missing pieces (see Critical Issues) |
| 10 | Backward compatible (won't break existing tests) | ⚠️ PARTIAL | `paidEngines` removal changes public export |
| 11 | Dependencies (tasks in correct order) | ✅ PASS | Phase 1 sequential, Phase 2 sequential, phases parallel — correct |
| 12 | Integration (new code integrates cleanly?) | ❌ FAIL | New engines not wired into tool implementations |

---

## Critical Issues (Must Fix Before Implementing)

### C1. New engines not wired into tool implementations

**Severity:** CRITICAL  
**Files affected:** `src/tools/free-search.ts`, `src/tools/free-search-advanced.ts`, `src/tools/capabilities.ts`  
**Plan tasks affected:** Task 2.3

The plan adds `bing` and `baidu` to `src/types.ts` and `src/engines/index.ts`, but never updates the actual *tool implementation* files. As written, the engines will exist in the type system but no tool will actually call `searchBing()` or `searchBaidu()`.

**Required changes (add to Task 2.3 or create Task 2.4):**

1. **`src/tools/free-search.ts`** — update all of:
   - `import { searchBing } from '../engines/bing.js';`
   - `import { searchBaidu } from '../engines/baidu.js';`
   - `const SUPPORTED_ENGINES: SearchProvider[] = ['duckduckgo', 'sogou', 'brave', 'tavily', 'bing', 'baidu'];`
   - `const FREE_ENGINES: SearchProvider[] = ['duckduckgo', 'sogou', 'bing', 'baidu'];`
   - `const ENGINE_WEIGHTS` — add entries for bing (0.85) and baidu (0.8)
   - `switch` statement in `searchEngine()` — add `case 'bing':` and `case 'baidu':`
   - Zod schema for the `engines` parameter — add `'bing'` and `'baidu'` to the enum
   - `PROVIDER_MAP` — add entries for bing and baidu

2. **`src/tools/free-search-advanced.ts`** — update the hardcoded engine list to include `'bing'` and `'baidu'`.

3. **`src/tools/capabilities.ts`** — update the engine list in the documentation string.

---

### C2. Missing imports in `src/index.ts` rewrite (Task 1.3)

**Severity:** CRITICAL  
**File:** `src/index.ts`

The plan shows the `main()` function using `loadConfig()` and `createHttpServer()` but **does not show the import statements**. The code will not compile.

**Required additions:**
```typescript
import { loadConfig } from './infrastructure/config.js';
import { createHttpServer } from './infrastructure/http.js';
```

---

### C3. New modules not exported from `src/infrastructure/index.ts`

**Severity:** IMPORTANT  
**Files:** `src/infrastructure/index.ts`, `src/infrastructure/config.ts`, `src/infrastructure/http.ts`

The plan creates `config.ts` and `http.ts` in `src/infrastructure/`, but never adds re-exports to `src/infrastructure/index.ts`. Every other module in this directory is re-exported from the index. Without this, imports must reference the full path, which is inconsistent with the codebase convention.

**Required additions to `src/infrastructure/index.ts`:**
```typescript
export { loadConfig } from './config.js';
export type { Config } from './config.js';
export { createHttpServer } from './http.js';
export type { HttpServerOptions, HttpServer } from './http.js';
```

---

### C4. SSE endpoint is a stub — no real MCP SSE transport

**Severity:** IMPORTANT  
**File:** `src/infrastructure/http.ts`

The plan claims "MCP SDK SSE transport" but the `/sse` endpoint just sends `data: {"type":"connected"}\n\n` and never connects to the MCP server. The actual MCP SDK provides `SSEServerTransport` (from `@modelcontextprotocol/sdk/server/sse.js`). Without this, the HTTP daemon cannot serve actual MCP clients over SSE — it only has a health check endpoint.

**Recommendation:** Either:
- (a) Implement proper SSE transport using `SSEServerTransport` from the MCP SDK, OR
- (b) Clearly document this as a "placeholder / health-only HTTP mode" and defer real SSE to a follow-up task.

If (b), update acceptance criteria to reflect the limited scope.

---

## Important Issues (Should Fix)

### I1. `decodeHTMLTags` duplicated (DRY violation)

**Files:** `src/engines/bing.ts` (line 536-545), `src/engines/baidu.ts` (line 700-709)

Both Bing and Baidu engine files define an identical `decodeHTMLTags()` function. This should be extracted to a shared utility, e.g. `src/infrastructure/html-utils.ts`.

---

### I2. HTTP test doesn't exercise actual HTTP behavior (Task 1.2)

**File:** `tests/infrastructure/http.test.ts`

The test only checks that the returned object has `listen`, `close`, `getPort` methods. It never:
- Actually starts the server
- Makes HTTP requests to verify `/health`, `/sse`, CORS, or 404
- Checks response bodies, status codes, or headers

The acceptance criteria list 5 items, but the test only covers item 1. Add integration tests that exercise the actual endpoints.

---

### I3. Engine tests don't exercise HTML parsing (Tasks 2.1, 2.2)

**Files:** `tests/engines/bing.test.ts`, `tests/engines/baidu.test.ts`

The tests mock `fetch` to return `<html><body>test</body></html>`, then only check `Array.isArray(results)`. They never test:
- Whether the parser extracts titles, URLs, snippets from realistic HTML
- Edge cases (malformed HTML, missing elements, anti-bot pages)
- Whether `limit` parameter is respected

The existing codebase has a better pattern: `tests/engines.test.ts` re-implements parsers in tests (`simulateDdgParse`, `simulateSogouParse`) and tests them with realistic HTML fragments. The Bing/Baidu tests should follow this pattern.

---

### I4. No `afterEach` cleanup for `process.env` in config test (Task 1.1)

**File:** `tests/infrastructure/config.test.ts`

The test has `beforeEach` to copy env, but no `afterEach`/`afterAll` to restore it. Vitest may run test files in the same process, causing cross-file pollution. Add:

```typescript
afterEach(() => {
  process.env = originalEnv;
});
```

---

### I5. Engine registry duplicates provider metadata (Task 2.3)

**File:** `src/engines/index.ts`

The plan imports `bingProvider` and `baiduProvider` from their modules, but then ignores them and re-declares the metadata inline:

```typescript
bing: { id: 'bing', name: 'Bing', isFree: true, languages: ['en', 'zh'] },
```

This duplicates what's already in `bingProvider`. Use the imported objects instead:

```typescript
bing: bingProvider,
baidu: baiduProvider,
```

Also, re-export the search functions from the index (matching the DDG/Sogou pattern):

```typescript
export { searchBing, bingProvider } from './bing.js';
export { searchBaidu, baiduProvider } from './baidu.js';
```

---

### I6. `paidEngines` removed from `engines/index.ts`

**File:** `src/engines/index.ts`

Currently `engines/index.ts` exports `paidEngines: SearchProvider[] = ['brave', 'tavily']`. The plan's replacement drops this entirely. While `free-search.ts` has its own copy, this is a public export change that could break external consumers. Either keep `paidEngines` updated, or add a deprecation notice.

---

### I7. `parseMode` is redundant with `loadConfig` (Task 1.3)

**File:** `src/index.ts`

The plan introduces `parseMode(mode)` which duplicates logic already in `loadConfig()`. The `Config.mode` field is already typed as `'stdio' | 'http' | 'both'` with fallback to `'stdio'`. Instead of a new function, just use `config.mode` directly.

---

### I8. Baidu regex uses hashed class names

**File:** `src/engines/baidu.ts`

The regex `content-right_8Zs40` uses a specific hash suffix (`8Zs40`). Baidu's class names are dynamically generated and change frequently. This will break in production. The fallback pattern (lines 679-695) is more robust but still fragile. Consider using attribute-based selectors or a library like `cheerio` for HTML parsing.

---

### I9. Test mocks not restored on exception

**Files:** `tests/engines/bing.test.ts`, `tests/engines/baidu.test.ts`

The tests save and restore `global.fetch` but don't use `try/finally`. If the async test body throws, `global.fetch` is never restored, potentially breaking other tests. Use:

```typescript
const originalFetch = global.fetch;
try {
  // test body
} finally {
  global.fetch = originalFetch;
}
```

---

## Minor Issues

### M1. Console.error vs pino logger

The plan uses `console.error()` for logging, but the project already has a pino-based logger (`src/infrastructure/logger.ts`). The new engines and HTTP module should use the project's logger for consistency.

### M2. Task 1.4 — full JSON overwrite instead of targeted edit

The plan shows the entire `scripts` block as a replacement. A diff or targeted patch would be safer to avoid accidentally reverting other package.json fields.

### M3. Version string hardcoded

The plan hardcodes `'2.0.0'` in the health endpoint response, in `src/index.ts`, and in the `McpServer` constructor. This should ideally be derived from `package.json` to stay in sync.

### M4. No mention of updating `src/engines/index.ts` export for search functions

The plan only imports providers for the registry but doesn't re-export the search functions (matching the existing DDG/Sogou pattern in engines/index.ts lines 3-4).

---

## Acceptance Criteria Per Task

### Task 1.1 — Config Module
1. ✅ `loadConfig()` returns correct defaults when no env vars set
2. ✅ MODE env var maps to correct mode string
3. ✅ PORT env var parsed as integer (not string)
4. ✅ ENABLE_CORS and USE_PROXY parsed as booleans
5. ✅ ALLOWED_ENGINES comma-separated string parsed into array
6. ❌ Missing: ALLOWED_ENGINES default should be empty array (no default engines)
7. ❌ Missing: Tests verify env var is restored after test suite

### Task 1.2 — HTTP Server Module
1. ✅ `createHttpServer()` returns object with listen/close/getPort
2. ❌ Missing: `GET /health` returns `{"status":"ok","version":"2.0.0"}` with 200 status
3. ❌ Missing: `GET /sse` returns SSE content-type headers (text/event-stream)
4. ❌ Missing: CORS headers present when enableCors=true
5. ❌ Missing: 404 returned for unknown routes
6. ❌ Missing: OPTIONS preflight returns 204

### Task 1.3 — Entry Point Update
1. ✅ `parseMode()` handles stdio/http/both/invalid
2. ❌ Missing: MODE=http PORT=3000 starts HTTP server (no integration test)
3. ❌ Missing: MODE=stdio starts stdio server (default, backward compatible)
4. ✅ MODE=both starts both
5. ✅ All existing tests pass
6. ❌ Missing: New imports for `loadConfig` and `createHttpServer` are present

### Task 1.4 — Package.json Scripts
1. ❌ Missing: `npm run dev:http` actually starts HTTP server
2. ❌ Missing: `npm run dev:both` starts both modes
3. ✅ `npm run build` succeeds
4. ❌ Missing: `npm run start:http` documented as usable in production

### Task 2.1 — Bing Engine
1. ✅ `bingProvider` has correct metadata (id='bing', isFree=true, languages=['en','zh'])
2. ✅ `searchBing()` returns Promise<SearchResult[]>
3. ❌ Missing: HTML parsing extracts title, url, snippet from realistic Bing HTML
4. ✅ Timeout handling works
5. ✅ Tests pass
6. ❌ Missing: decodeHTMLTags is not duplicated (should be shared)
7. ❌ Missing: Engine is actually usable through free_search/free_search_advanced tools

### Task 2.2 — Baidu Engine
1. ✅ `baiduProvider` has correct metadata
2. ✅ `searchBaidu()` returns Promise<SearchResult[]>
3. ❌ Missing: HTML parsing works with fallback pattern (tested with realistic HTML)
4. ✅ Chinese language support
5. ✅ Tests pass
6. ❌ Missing: Regex robustness against dynamic class names
7. ❌ Missing: Engine is actually usable through free_search/free_search_advanced tools

### Task 2.3 — Register New Engines
1. ✅ `SearchProvider` type includes 'bing' and 'baidu'
2. ✅ `engines` registry includes both new providers
3. ✅ `freeEngines` includes all 4 free engines
4. ❌ Missing: Engine registry uses imported provider objects (not duplicated metadata)
5. ❌ Missing: search functions re-exported from engines/index.ts
6. ❌ Missing: free-search.ts updated to actually call new engines
7. ❌ Missing: All existing tests still pass after registry changes

---

## Summary of Required Changes

| # | Change | Priority | Plan Section |
|---|--------|----------|-------------|
| 1 | Wire Bing/Baidu into `free-search.ts`, `free-search-advanced.ts`, `capabilities.ts` | CRITICAL | Task 2.3+ |
| 2 | Add missing imports to `src/index.ts` | CRITICAL | Task 1.3 |
| 3 | Export new modules from `src/infrastructure/index.ts` | IMPORTANT | Task 1.1/1.2 |
| 4 | Implement proper SSE transport or scope-reduce | IMPORTANT | Task 1.2 |
| 5 | Extract `decodeHTMLTags` to shared utility | IMPORTANT | Task 2.1/2.2 |
| 6 | Add real HTTP integration tests | IMPORTANT | Task 1.2 |
| 7 | Add realistic HTML parsing tests for Bing/Baidu | IMPORTANT | Task 2.1/2.2 |
| 8 | Fix `process.env` cleanup in config test | MINOR | Task 1.1 |
| 9 | Use imported provider objects in registry | MINOR | Task 2.3 |
| 10 | Keep `paidEngines` export or add deprecation | MINOR | Task 2.3 |
| 11 | Use pino logger instead of console.error | MINOR | All tasks |
| 12 | Add `try/finally` to fetch mock restoration | MINOR | Task 2.1/2.2 |

---

## Recommendation

**REQUEST_CHANGES** — The plan has 4 critical issues (C1-C4) that would prevent successful implementation. The most severe is C1: the new engines are defined but never actually connected to the tools that use them. C2 (missing imports) would cause compilation failures. Fix these issues and address the important items (I1-I9) before beginning implementation.
