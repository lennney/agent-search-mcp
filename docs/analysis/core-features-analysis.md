# Core Feature Improvement Analysis

> **Date:** 2026-06-23
> **Codebase:** free-agent-search-mcp v2.1.0 at `/home/ubuntu/agent-search-mcp`
> **Scope:** Search quality, token optimization, confidence scoring, performance, error handling, content extraction

---

## 1. Search Quality (Relevance, Ranking, Dedup)

### Current Implementation

| Component | File | What It Does |
|---|---|---|
| `filterLowQuality` | `src/aggregation/dedup.ts` | Filters results with snippets <20 chars, ads (DDG y.js, /ad/), non-http URLs, search engine internal links, Wikipedia category pages |
| `dedupByUrl` | `src/aggregation/dedup.ts` | URL normalization (hostname + path, lowercased), frequency counting across engines, keeps result with longer snippet |
| `dedupByTitle` | `src/aggregation/dedup.ts` | Jaccard similarity on whitespace-tokenized titles, threshold 0.85 |
| `scoreAndRank` | `src/aggregation/scorer.ts` | Token-based scoring: bucket classification (title+body=0.4, title-only=0.3, body-only=0.2, neither=0), Wikipedia boost (+0.15), GitHub boost (+0.05), frequency bonus (+0.1 per engine, capped at 0.3), multiplied by max engine weight (0.5–0.95) |
| `ENGINE_WEIGHTS` | `src/tools/free-search.ts` | Hardcoded weights: brave=0.95, exa=0.92, bing=0.9, tavily=0.9, duckduckgo=0.85, sogou=0.8, baidu=0.75 |

### Weaknesses

1. **Jaccard similarity on titles is semantically shallow.** It computes word-overlap of whitespace tokens. Two titles like *"How to deploy Node.js on AWS"* and *"Deploying Node.js applications to AWS"* have low Jaccard similarity (~0.33) despite being about the same topic. The threshold of 0.85 is so high that only near-exact duplicates are caught.

2. **Score bucket system is overly coarse.** All results fall into one of 4 discrete buckets (0.2, 0.3, 0.4, or 0.55 with boosts). Within a bucket, a result where *all* query tokens appear in the title ranks identically to one where only *one* token matches. No gradient.

3. **Token matching uses `String.includes()` — no TF-IDF weighting.** Common stopwords match as strongly as rare, meaningful query terms. A query like "the effect of caffeine on sleep" would score "the" and "of" as equally important as "caffeine" and "sleep".

4. **Original engine ranking position is discarded.** If Bing ranks something #1 and #10, both results get the same score from the token bucket — the original rank signal is lost entirely.

5. **Engine weights are static and never adjusted.** Brave always gets 0.95 even if it has been returning irrelevant results for this query type. There's no feedback loop from the health tracker into the weighting.

6. **Frequency bonus double-counts interdependent engines.** DDG uses Bing's backend, so a result appearing in both DDG and Bing is counted twice (frequency=2 → +0.2 bonus) even though they share the same underlying index.

7. **`filterLowQuality` has hardcoded ad patterns specific to current HTML structure.** Patterns like `y.js?` and `/ad/` are brittle — search engines change their DOM frequently.

### Improvement Suggestions

| Suggestion | Effort | Impact | Details |
|---|---|---|---|
| Replace Jaccard with cosine similarity over character n-grams | Medium | **High** | 3-gram overlap captures near-duplicate titles much better than word-level Jaccard. Catches reworded duplicates. |
| Add TF-IDF term weighting to scorer | Medium | **High** | Weight rare query terms more heavily. Use inverse document frequency (IDF) estimated from query or corpus. |
| Include original position signal from engines | Low | **Medium** | Normalize rank position (1/rank) and blend into score as a small bonus (e.g., 0.05 * (1/rank)). |
| Replace bucket classification with continuous relevance score | Medium | **High** | Compute `(titleMatches / totalTokens) * 0.5 + (bodyMatches / totalTokens) * 0.3` instead of discrete buckets. Produces finer granularity. |
| Dynamic engine weights based on health tracker precision | Low | **Medium** | Use `healthTracker.avgLatency` and success rate to adjust weights: faster+healthier providers get boosted. |
| Dedup by provider family (avoid DDG/Bing double-count) | Low | **Medium** | Normalize frequency counting so DDG and Bing are treated as one provider group since DDG uses Bing's backend. |

---

## 2. Token Optimization

### Current Implementation

| Component | File | What It Does |
|---|---|---|
| Title truncation | `src/aggregation/format.ts` | `title.slice(0, 100)` — hard character limit |
| Snippet truncation | `src/aggregation/format.ts` | `snippet.slice(0, 200)` — hard character limit |
| No summary generation | — | Results are returned verbatim from engines |

### Weaknesses

1. **Character-based truncation is not token-aware.** 200 English characters ≈ 50 tokens, but 200 CJK characters ≈ 200 tokens. This wastes context for English queries and truncates too aggressively for CJK.

2. **No prioritized truncation.** Snippets are cut at character boundary with no awareness of where the most query-relevant content is. The cut may happen mid-sentence or mid-word.

3. **No adaptive result count.** The number of results returned is fixed by user's `count` parameter, regardless of how many tokens each result consumes. There's no token-budget-aware result limiting.

4. **No LLM-based summarization.** Even for paid engines that could afford a summary call, results are returned as raw snippets. This is a missed opportunity for higher-quality condensed output.

### Improvement Suggestions

| Suggestion | Effort | Impact | Details |
|---|---|---|---|
| Token-aware truncation | Low | **Medium** | Estimate token count using `Math.ceil(text.length / 4)` for English or `text.length` for CJK. Truncate to token budget, not character count. |
| Query-focused snippet extraction | Low | **Medium** | Before truncating, find the portion of the snippet with highest query-term density and prefer that segment. |
| Adaptive result limiting by token budget | Low | **Medium** | Add an estimated-tokens field to each result. When the accumulator exceeds a configurable budget, stop adding results. Return the budget-optimized set. |
| Optional LLM summarization for paid engines | High | **Low** | When using tavily/exa/brave paid tier, offer an option to generate a one-sentence summary of each result (via their built-in summarization or a separate API call). |

---

## 3. Confidence Scoring (Multi-Source Verification)

### Current Implementation

| Component | File | What It Does |
|---|---|---|
| `confidence` field | `src/aggregation/scorer.ts` | `r.engines?.length || 1` — raw count of engines that returned the result |
| Sort order | `src/aggregation/scorer.ts` | Primary sort by confidence (descending), then score (descending) |
| `minConfidence` filter | `src/tools/free-search.ts` | Filters results where `confidence >= minConfidence` (default: 1) |
| `high_confidence` metric | `src/aggregation/format.ts` | Count of results where `confidence >= 2` |

### Weaknesses

1. **Confidence = engine count is deeply simplistic.** Every engine vote counts equally regardless of quality. A result returned by Sogou (weight 0.8) + Baidu (0.75) scores confidence=2, same as one returned by Brave (0.95) + Exa (0.92). No quality weighting.

2. **No content-level agreement analysis.** Two engines might return the same URL but with completely different, even contradictory, snippets. The current system treats this as "verified by 2 sources" (strong signal) when it's actually a weak signal.

3. **Default threshold of 1 means no filtering.** `minConfidence=1` passes everything. Most users won't know to set it higher.

4. **No recency/decay factor.** A result verified by 3 engines 10 minutes ago gets the same confidence as one verified 3 hours ago. Search results are time-sensitive.

5. **Confidence is conflated with frequency.** A URL appearing once across 4 engines gets confidence=1, same as a URL appearing uniquely in 1 engine. The frequency bonus in `calculateScore` partially addresses this, but it's not reflected in the `confidence` field used for filtering.

### Improvement Suggestions

| Suggestion | Effort | Impact | Details |
|---|---|---|---|
| Weighted confidence score | Low | **High** | Replace `engines.length` with `sum(engine_weights_for_this_result) / sum(max_weights)`. E.g., Brave+Exa = (0.95+0.92)/2 = 0.935 vs Sogou+Baidu = (0.80+0.75)/2 = 0.775. |
| Add snippet agreement signal | Medium | **Medium** | When multiple engines return the same URL, compute cosine similarity of their snippets. Low similarity → reduce confidence (engines may have copied URL but disagree on content). |
| Add recency decay factor | Low | **Medium** | Multiply confidence by `exp(-hours_since_search / 24)` to decay over time. Cached results become less confident as they age. |
| Raise default minConfidence to 0.5 | Low | **Medium** | Once confidence becomes a 0-1 float, default filtering at 0.5 removes single-engine results that lack corroboration. |
| Surface confidence breakdown | Low | **Low** | Include `confidence_breakdown: { weighted: number, raw_count: number, engines_agreeing: string[] }` in output for debugging. |

---

## 4. Performance (Caching, Concurrency, Response Time)

### Current Implementation

| Component | File | What It Does |
|---|---|---|
| `SearchCache` | `src/infrastructure/cache.ts` | In-memory Map, TTL=60s, max 1000 entries, evicts oldest entry when full |
| `RateLimiter` | `src/infrastructure/rate-limiter.ts` | Per-provider 1-second minimum interval, simple `setTimeout`-based throttling |
| Batch concurrency | `src/tools/free-search.ts` | `Promise.allSettled` with `BATCH_SIZE = Math.max(2, Math.min(phase1Engines.length, Math.ceil(count/10)+1))` |
| Early exit | `src/tools/free-search.ts` | Stops batching when `allResults.length >= count * 1.5` |
| Cache write | `src/tools/free-search.ts` | Async via `setImmediate` — response is returned before cache is written |
| Cache key | `src/infrastructure/cache.ts` | `${query}:${count}:${engines.sort().join(',')}` |

### Weaknesses

1. **Cache is single-process only.** Each MCP session (and each restart) starts with a cold cache. No shared/Redis layer. For popular queries, every session makes the same network calls.

2. **Cache eviction is naive.** When full, it deletes the single oldest entry (Map insertion order). This is O(1) but can evict a frequently-accessed entry while leaving stale ones.

3. **Cache key is overly specific.** `engines.sort().join(',')` means `['duckduckgo','sogou']` and `['sogou','duckduckgo']` produce the same key (thanks to sort), but `['duckduckgo']` produces a different key from `['duckduckgo','sogou']` even though the latter is a superset. No subsumption logic.

4. **Fixed 60s TTL for all queries.** News queries need much shorter TTL (seconds); reference queries could benefit from much longer TTL (hours). No TTL differentiation.

5. **Rate limiter has no burst handling or backoff.** Fixed 1s interval doesn't adapt to provider rate limit headers (Retry-After, X-RateLimit-Remaining). If a provider returns 429, the next request still waits 1s.

6. **Batch size formula is arbitrary.** `Math.ceil(count/10) + 1` doesn't consider actual provider latency. If all providers are fast (Brave, Tavily) the batch could be larger; if slow (DDG via Python subprocess), smaller.

7. **No request collapsing.** Two identical concurrent `searchWithFallback` calls will both execute. The cache isn't checked until after the first completes.

8. **All search engines are always queried.** The fallback logic always runs phase 1 (all free engines) even if the user only specified 2. This wastes resources.

### Improvement Suggestions

| Suggestion | Effort | Impact | Details |
|---|---|---|---|
| Request collapsing (dedup in-flight) | Low | **High** | Track pending promises by cache key. Duplicate calls return the same promise instead of starting a second search. |
| Differentiated TTL by query type | Low | **Medium** | Short TTL (10s) for news/trending queries, longer TTL (5min) for knowledge/reference queries. Heuristic: if query contains date words → short TTL. |
| Cache key normalization | Low | **Medium** | Lowercase+trim query, always sort engines, strip duplicate engines. Consider prefix-based matching (`duckduckgo` key can serve `duckduckgo,sogou` request). |
| Adaptive rate limiting | Medium | **Medium** | Parse Retry-After headers, track 429 responses, implement exponential backoff per provider. |
| Skip engines that won't be needed | Low | **Medium** | If early exit threshold is met quickly (e.g., Brave returned 15 results immediately), don't bother querying remaining free engines. Current code already does this. |
| Implement LRU eviction | Low | **Low** | Replace Map with proper LRU (or use existing `lru-cache` package) to keep frequently-accessed entries. |
| Optional file-based cache persistence | Medium | **Low** | For long-running HTTP mode, persist cache to disk so restarts don't lose it. |

---

## 5. Error Handling (Graceful Degradation, Retry Logic)

### Current Implementation

| Component | File | What It Does |
|---|---|---|
| `searchEngine` catch block | `src/tools/free-search.ts` | Catches all errors, calls `healthTracker.recordFailure()`, returns empty array |
| `HealthTracker` | `src/infrastructure/health.ts` | Tracks error count per provider, marks unhealthy at >=5 errors, decrements errorCount by 1 per success |
| `Promise.allSettled` | `src/tools/free-search.ts` | Ensures one engine failure doesn't kill the batch |
| Health check before query | `src/tools/free-search.ts` | `if (!healthTracker.isHealthy(engine))` skips unhealthy providers |
| Per-engine timeouts | Various engines | DDG: 15s (Python subprocess), Brave: 5s (fetch), Tavily: 5s, Exa: 15s, Bing: 10s, Baidu: 10s, Sogou: no explicit timeout |

### Weaknesses

1. **No retry logic at all.** A single transient network error (e.g., DNS failure, connection reset) permanently reduces the error count. No attempt to retry before recording a failure.

2. **Health recovery is linear and slow.** After hitting 5 failures, a provider needs 5 consecutive successes to recover. A temporary outage (e.g., 30s of flapping) can leave a provider marked unhealthy for many minutes after it's actually fine.

3. **No circuit breaker with half-open state.** The system is binary (healthy/unhealthy) with no half-open state where a single test request is sent to probe recovery.

4. **Error details are discarded.** In `searchWithFallback`, rejected promises are captured as `{ engine: 'unknown', message: result.reason?.message || 'Unknown error' }`. The actual engine name is lost.

5. **Timeouts are inconsistent and not centrally configured.** Each engine sets its own timeout. Sogou has no explicit timeout at all (could hang indefinitely).

6. **No graceful degradation for paid engines.** If a paid engine is unhealthy, phase 2 is simply skipped — no fallback to alternative paid engines.

7. **DDG's Python subprocess is a single point of partial failure.** If Python3 or the ddgs library isn't installed, the error is silently swallowed with a `console.error`. But the subprocess could also deadlock (no stdin/out handling).

### Improvement Suggestions

| Suggestion | Effort | Impact | Details |
|---|---|---|---|
| Add retry with exponential backoff | Medium | **High** | Retry transient failures (network errors, 5xx) once or twice with 500ms/1s delays before recording a permanent failure. |
| Implement circuit breaker with half-open | Medium | **High** | After N failures, enter "open" state (skip provider). After a configurable cooldown, enter "half-open" and allow 1 test request. Success → close; failure → open again with longer cooldown. |
| Centralize timeout configuration | Low | **Medium** | Move all timeouts to `Config` with sensible defaults. Make them overridable via env vars (`SEARCH_TIMEOUT_MS=10000`). |
| Preserve engine name in failure reporting | Low | **Medium** | In the `batch.map()` callback, catch errors per-engine and include the engine name. Currently engine name is lost for rejected promises. |
| Add periodic health probe | Low | **Medium** | Periodically (every 60s) try a lightweight query against unhealthy providers to detect recovery faster than waiting for user requests. |
| Graceful degradation chain for paid engines | Low | **Medium** | If the user's preferred paid engine fails, try alternative paid engines before giving up on phase 2. |

---

## 6. Content Extraction (Page Extraction Quality)

### Current Implementation

| Component | File | What It Does |
|---|---|---|
| `free_extract` MCP tool | `src/tools/free-extract.ts` | Proxies URL through Jina Reader API (`https://r.jina.ai/{url}`), returns markdown, truncates to `max_length` chars |
| `fetchGithubReadme` | `src/tools/fetch-tools.ts` | Fetches raw README from `raw.githubusercontent.com`, tries `main` then `master` branch, tries common README filenames |
| `fetchCsdnArticle` | `src/tools/fetch-tools.ts` | Regex-based: finds `<article>` or `<div class="article">`, strips HTML tags |
| `fetchJuejinArticle` | `src/tools/fetch-tools.ts` | Uses Juejin public API (`api.juejin.cn/content_api/v1/article/detail`), returns markdown content |
| SSRF validation | `src/infrastructure/url-validator.ts` | Blocks localhost, private IPs, cloud metadata endpoints, non-http protocols |

### Weaknesses

1. **Single point of failure on Jina Reader.** `free_extract` has zero fallback. If `r.jina.ai` is down, rate-limited, or returns an error, the user gets an error. No local HTML-to-markdown conversion as backup.

2. **No local readability/extraction library.** For non-specialized URLs (e.g., a blog post or documentation page), there's no Readability-js or Turndown-based extraction. The Jina API is the only path.

3. **CSDN extraction is regex-based and fragile.** The current regex patterns (`<article[^>]*>...`, `<div class="*article*">`) will break if CSDN changes class names or HTML structure. No schema-aware parsing.

4. **No extraction quality metrics.** The system doesn't assess whether the extracted content is useful (e.g., has it succeeded in extracting article body vs. just getting navigation bars).

5. **No extraction result caching.** Every `free_extract` call hits the network. For URLs that appear in search results repeatedly, this is wasteful.

6. **Character-based truncation in free_extract.** `content.slice(0, max_length)` can cut mid-sentence or in the middle of a markdown code block.

7. **Jina Reader URL is hardcoded.** Can't be pointed at a self-hosted Jina instance or alternative service.

8. **No image or structured data extraction.** Only text/markdown content is extracted.

### Improvement Suggestions

| Suggestion | Effort | Impact | Details |
|---|---|---|---|
| Add local HTML-to-markdown fallback | Medium | **High** | Bundle a pure-JS HTML-to-markdown converter (e.g., `turndown` package). When Jina fails, fetch the page directly and convert locally. Works offline/self-hosted. |
| Integrate Mozilla's Readability | Medium | **Medium** | Use `@mozilla/readability` (or `mozilla-readability`) to extract article content from any page. Provides title, author, clean HTML body. |
| Cache extraction results | Low | **Medium** | Add a simple `ExtractionCache` (or reuse `SearchCache`) keyed by URL+max_length. TTL ~5min for same-page re-extraction. |
| Sentence-aware truncation | Low | **Medium** | Instead of `slice(0, N)`, find the last sentence boundary before N. Use regex: `text.substring(0, N).replace(/\\s+\\S*$/, '')` or find last `. ` |
| Make Jina URL configurable | Low | **Low** | Add `JINA_READER_URL` env var (default: `https://r.jina.ai`). |
| Add extraction quality heuristics | Medium | **Low** | After extraction, check: length > threshold, presence of common HTML elements, ratio of text to HTML. Return warning if quality is suspect. |
| Support structured extraction (JSON-LD, Open Graph) | Medium | **Low** | Parse JSON-LD structured data and Open Graph meta tags for richer content metadata (author, publish date, image). |

---

## 7. Cross-Cutting Observations

### Security (Already Strong — Minor Tweaks)

The security layer in `src/infrastructure/security.ts` is well-designed:
- Injection pattern detection is thorough (ignoring previous instructions, role manipulation, data exfiltration, encoding tricks)
- XML boundary markers protect agent instruction boundaries
- URL phishing detection with patterns for typosquatting, IP-based URLs, suspicious TLDs
- Security metadata attached per result

**Opportunity:** Add a config option to *strip* rather than just mark injected content. Currently, a snippet with detected injection is prepended with `[⚠️ SUSPICIOUS CONTENT]` but the content is still returned. Some users may prefer hard removal.

### TypeScript/Code Quality

- Code is clean, well-structured, and consistently formatted
- Good use of TypeScript types throughout
- JSDoc comments on major functions
- Singleton pattern for cache/health/rate-limiter is simple and effective

**Opportunities:**
- Add unit tests for the scoring and dedup logic (currently minimal test coverage)
- Extract interface types from `free-search.ts` (e.g., `SearchResponse`, `FormattedResult`) into `types.ts` to avoid duplication with `format.ts`
- The `PROVIDER_MAP` in `free-search.ts` duplicates the `dedupByProvider` map in `dedup.ts`

---

## 8. Prioritized Action Roadmap

| Priority | Area | Suggestion | Expected Impact | Effort |
|---|---|---|---|---|
| **P0** | Error Handling | Retry transient failures + circuit breaker | High — prevents temporary hiccups from permanently disabling providers | Medium |
| **P0** | Confidence Scoring | Weighted confidence instead of raw engine count | High — dramatically more meaningful confidence signal | Low |
| **P0** | Performance | Request collapsing for in-flight duplicates | High — reduces duplicate network calls under concurrent access | Low |
| **P1** | Search Quality | TF-IDF term weighting + continuous relevance score | High — significantly better ranking granularity | Medium |
| **P1** | Search Quality | Character n-gram dedup (replace Jaccard) | High — catches near-duplicate titles | Medium |
| **P1** | Content Extraction | Local HTML-to-markdown fallback | High — eliminates Jina single point of failure | Medium |
| **P2** | Content Extraction | Readability integration for generic article extraction | Medium — supports many more sites | Medium |
| **P2** | Performance | Differentiated cache TTL by query type | Medium — better cache hit rates | Low |
| **P2** | Error Handling | Preserve engine name in failure reporting | Medium — better observability | Low |
| **P2** | Search Quality | Dynamic engine weights from health tracker | Medium — adaptability to provider quality | Low |
| **P3** | Token Optimization | Token-aware truncation + adaptive result limiting | Medium — better context window utilization | Low |
| **P3** | Search Quality | Include original engine rank position in scoring | Medium — incorporates lost signal | Low |
| **P3** | Security | Config option to hard-strip injected content | Low — defense-in-depth option | Low |
| **P3** | Performance | Adaptive rate limiting (parse Retry-After) | Medium — respects provider rate limits | Medium |

---

## 9. Summary

### Strengths of the Current Codebase
- **Clean architecture** — clear separation into engines, aggregation, infrastructure, tools
- **Robust error handling skeleton** — all engines return `SearchResult[]` and catch errors gracefully
- **Good security posture** — injection detection, URL safety checks, boundary markers
- **Effective multi-engine orchestration** — provider dedup, batch concurrency, early exit
- **Well-structured aggregation pipeline** — filter → dedup → score → format

### Most Impactful Improvements (Top 3)
1. **Weighted confidence scoring** (P0, Low effort) — transforms the confidence metric from a meaningless count into a meaningful quality signal with minimal code changes
2. **Retry logic + circuit breaker** (P0, Medium effort) — eliminates the biggest practical issue: transient failures permanently disabling providers
3. **Request collapsing** (P0, Low effort) — prevents concurrent duplicate queries, a common pattern in agent usage

### Quick Wins (Low Effort, Medium+ Impact)
- Preserve engine names in failure reporting (~5 lines)
- Differentiated cache TTL (~10 lines)
- Token-aware truncation (~10 lines)
- Dynamic engine weights from health tracker (~20 lines)
- Include original rank position (~5 lines)
