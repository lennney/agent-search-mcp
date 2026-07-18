# Test Coverage Gap Analysis

**Generated:** $(date '+%Y-%m-%d %H:%M')
**Project:** agent-search-mcp (~agent-search-mcp)
**Test status:** 25 test files, 270 tests, all passing
**Source files without full coverage:** 8 (plus 3 partially-tested functions)

---

## Legend

- **CRITICAL** — If broken, core user-facing functionality fails silently or noisily.
- **HIGH** — If broken, important feature degrades; hard to catch without tests.
- **MEDIUM** — Simple/small files, but used in production paths.
- **LOW** — Barrel re-exports, type defs, static resources, entry point.

---

## Critical Priority

### 1. `src/tools/free-search.ts` (780 lines) — **CRITICAL**

**Risk:** The central orchestration module — engine dispatch, batching, retry, caching, request collapsing, waterfall search, confidence basket check, concurrency calculation. Used by `free-search-advanced.ts`, `search-with-synthesis.ts`, `cli.ts`, and `index.ts`. If it breaks, every search endpoint in the project breaks.

**Untested functions (13 total):**

| Function | Lines | Logic |
|---|---|---|
| `searchEngine()` | 70–150 | Engine dispatch switch, health check, rate limiting, retry loop (exponential backoff), error classification |
| `isRetryableError()` | 155–175 | Classifies errors as retryable (network/timeout/5xx) vs terminal |
| `hasApiKey()` | 180–191 | Checks env vars for each paid engine |
| `getUniqueProviders()` | 52–65 | Deduplicates engines that share a backend (DDG→Bing) |
| `calculateAdaptiveConcurrency()` | 310–322 | Adaptive batch sizing based on engine health ratio |
| `searchWithFallback()` | 262–282 | Request collapsing (dedup in-flight calls), cache checking |
| `executeSearch()` | 287–292 | Router: waterfall vs parallel |
| `executeParallelSearch()` | 324–511 | Full parallel search pipeline: lang detection → cache check → provider dedup → batch concurrency → early exit → paid fallback → filter → dedup → score → domain filter → enrich → format |
| `executeWaterfallSearch()` | 519–728 | 3-phase waterfall (1a→1b→paid→query expansion), confidence basket check per phase |
| `makeCollapseKey()` | 245–249 | Cache key generation for request collapsing |
| `setupFreeSearchTool()` | 735–780 | MCP tool registration with zod schema |
| `searchBatch()` (inner) | 538–591 | Reusable waterfall batch executor with inline scoring |
| `WATERFALL_PHASES` | 513–517 | Static phase config (dead-code risk if misused) |

**Suggested test cases:**
1. `searchEngine()` — Mock each engine; verify dispatch switch; test health-skip path; test rate-limit wait; test retry on retryable errors (ECONNRESET, timeout, 5xx); test terminal errors (4xx) skip retry; verify healthTracker.recordSuccess/Failure calls
2. `isRetryableError()` — Test ECONNRESET, ECONNREFUSED, ETIMEDOUT, network, timeout, abort, HTTP 500, HTTP 502, HTTP 501 (NOT retryable), generic Error (not retryable)
3. `hasApiKey()` — Test with/without env vars for brave/tavily/exa; free engines always return true
4. `getUniqueProviders()` — Test DDG→Bing dedup; sogou stays; mixed list; no-op for single engine
5. `calculateAdaptiveConcurrency()` — >50% unhealthy → 2; all healthy → aggressive; mixed → base; empty engines → ?; various count values
6. `searchWithFallback()` — Request collapsing: same query twice in parallel returns same promise; collapse key uniqueness
7. `executeParallelSearch()` — Full pipeline integration with mocked engines: free engines only, mixed, paid fallback when free insufficient, early exit at 1.5×count, cache-hit returns immediately, domain include/exclude filters, minConfidence filter, language detection, cache write async, enrichment integration
8. `executeWaterfallSearch()` — Phase 1a sufficient stops early; Phase 1a+b needed; all phases including paid; query expansion phase; Chinese query variants path; basket confidence check per phase; enricher in waterfall

---

### 2. `src/tools/free-extract.ts` (52 lines) — **CRITICAL**

**Risk:** User-facing content extraction tool. Calls Jina Reader API externally. SSRF protection is security-critical — if URL validation is bypassed, internal network can be targeted.

**Untested function:** `registerFreeExtract()`

**Suggested test cases:**
1. URL validation rejects invalid URLs → `isError: true` with error message
2. Jina Reader returns 200 → content returned, truncated to `max_length`
3. Jina Reader returns non-200 → `isError: true`
4. Jina Reader throws (network/timeout) → `isError: true`
5. Content longer than max_length → truncated correctly
6. Empty URL → validation fails

---

### 3. `src/tools/search-with-synthesis.ts` (65 lines) — **HIGH**

**Risk:** Key tool for agent-based search. Wraps free-search + builds `prompt_hint` via `buildPromptHint()` for agent-guided synthesis.

**Untested function:** `registerSearchWithSynthesis()`

**Suggested test cases:**
1. Calls `searchWithFallback` with correct options (waterfall=true, enrich=true, minConfidence mapped)
2. Maps raw results → `SynthesisResult[]` format
3. Calls `buildPromptHint` with mapped results
4. Returns correct JSON structure with `prompt_hint` and `meta`
5. Error from `searchWithFallback` → catches and returns `isError: true`
6. Empty results → returns empty array, still builds prompt hint
7. Language parameter passed through correctly

---

### 4. `src/tools/free-search-advanced.ts` (61 lines) — **HIGH**

**Risk:** Thin wrapper but user-facing with many parameter combinations. Wrong parameter mapping breaks the whole tool.

**Untested function:** `registerFreeSearchAdvanced()`

**Suggested test cases:**
1. Maps all input params correctly to `SearchWithFallbackOptions` (count, min_confidence, language, include_domains, exclude_domains, waterfall, waterfall_min_results, waterfall_min_confidence, enrich, enrich_max)
2. Default values applied correctly (count=5, waterfall=true, enrich=true, etc.)
3. Engines list includes all 6 engines
4. Error from `searchWithFallback` → `isError: true`
5. JSON stringifies results

---

## High Priority

### 5. `src/engines/brave.ts` (39 lines) — **HIGH**

**Risk:** Paid engine — if broken, paid-tier users silently get empty results with no warning. Tests need to mock fetch.

**Untested function:** `BraveProvider.search()`

**Suggested test cases:**
1. No API key → returns empty array (no throw)
2. Successful response → maps `web.results[]` correctly (title, url, description mapped)
3. HTTP error (non-200) → throws `Error`
4. Network timeout → throws
5. Missing or malformed JSON → throws
6. Empty `web.results` → returns empty array
7. Request URL and headers correct (`X-Subscription-Token`)

---

### 6. `src/engines/tavily.ts` (38 lines) — **HIGH**

**Risk:** Same as Brave. Paid engine, no test coverage.

**Untested function:** `TavilyProvider.search()`

**Suggested test cases:**
1. No API key → returns empty array
2. Successful response → maps `results[]` correctly (content→snippet)
3. HTTP error (non-200) → throws
4. Network timeout → throws
5. POST request body correct (api_key, query, max_results, search_depth)
6. Empty results → returns empty array

---

### 7. `src/aggregation/dedup.ts` — **Partially tested** (3 of 5 functions untested)

**Risk:** `filterLowQuality()` is called in every search pipeline (both parallel and waterfall). `dedupByProvider()` is exported but notably unused in `free-search.ts` (has its own `getUniqueProviders`).

**Tested (✅ via `tests/aggregation.test.ts`):**
- `normalizeUrl()` ✅
- `dedupByUrl()` ✅
- `dedupByTitle()` ✅

**Untested:**

**`filterLowQuality()`** — 22 lines, filters out ads, empty snippets, invalid URLs, internal links.

Suggested test cases:
1. Filters results with snippet < 20 chars
2. Filters DDG ads (`y.js?`, `/ad/`, `duckduckgo.com/y.js`)
3. Filters non-http URLs
4. Filters Sogou internal links (`sogou.com/link`)
5. Filters Wikipedia categories
6. Valid result passes through
7. Empty input → empty output
8. Mixed valid/invalid → only valid kept

**`dedupByProvider()`** — 21 lines, engine→provider mapping dedup.

Suggested test cases:
1. DDG→Bing dedup: `['duckduckgo', 'sogou']` → `['duckduckgo', 'sogou']` (DDG kept, sogou kept)
2. Unknown engine kept as-is
3. All same provider → single result
4. Empty input → empty output

---

### 8. `src/aggregation/format.ts` — **Partially tested**

**Tested (✅ via `tests/aggregation.test.ts`):**
- `formatResults()` ✅
- `isChinese()` ✅

**Untested:**

**`formatResultsXml()`** — 22 lines, XML boundary-marked output.

**Note:** Dead code in current codebase — no internal callers. But it's part of the public module API.

Suggested test cases:
1. Returns valid XML wrapper with `<search-response>` root
2. Each result wrapped with boundary markers
3. Security note included in XML header
4. Chinese truncation rules apply (150/300 chars)
5. Empty results → still returns valid XML structure
6. Security metadata included when threats detected

---

## Low Risk / Nice-to-Have

| File | Lines | Why Low Risk | Suggested Tests |
|---|---|---|---|
| `src/tools/health.ts` | 12 | Simple resource registration; `HealthTracker` already tested via `engines.test.ts` | Verify MCP resource format |
| `src/tools/capabilities.ts` | 37 | Static text; never changes | Verify resource returns correct markdown text |
| `src/infrastructure/logger.ts` | 10 | Pino singleton, no custom logic | Verify writes to stderr (fd 2) |
| `src/index.ts` | 57 | Entry point; integration-level | Integration test: server starts with all tools registered |
| `src/types.ts` | — | Type definitions only | N/A |
| `src/aggregation/index.ts` | 11 | Barrel re-export | N/A |
| `src/synthesis/index.ts` | 1 | Barrel re-export | N/A |
| `src/engines/index.ts` | — | Barrel re-export | N/A |

---

## Summary

| Priority | Files | Untested Functions | Lines Uncovered |
|---|---|---|---|
| **CRITICAL** | 2 (`free-search.ts`, `free-extract.ts`) | ~14 | ~832 |
| **HIGH** | 4 (`search-with-synthesis.ts`, `free-search-advanced.ts`, `brave.ts`, `tavily.ts`) | 4 | ~203 |
| **MEDIUM** (partially) | 2 (`dedup.ts`, `format.ts`) | 3 functions | ~48 |
| **LOW** | 8 (entry/barrel/static) | 0 | ~130 |

**Quick wins** (under 30 lines of test each, high impact):
1. `brave.ts` + `tavily.ts` — 77 lines total, mock fetch, test API key check + response parsing
2. `dedup.ts::filterLowQuality()` — 22 lines, pure function, easy to parameterize
3. `free-extract.ts` — 52 lines, mock fetch to Jina Reader
4. `free-search-advanced.ts` — 61 lines, parameter mapping only

**Heavy lift** (needs careful mocking):
- `free-search.ts` (780 lines) — requires mock engine layer, but would catch the most bugs
- `search-with-synthesis.ts` — needs searchWithFallback mocked

**Abandoned/dead code:**
- `formatResultsXml()` — declared, never called internally. Either remove or add minimal test if used externally.
- `dedupByProvider()` — declared, imported, but never called (free-search.ts uses local `getUniqueProviders` instead). Remove or test.
