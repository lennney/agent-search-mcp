# Benchmark Methodology

## Overview

This benchmark measures Agent Search MCP's real-world performance across four dimensions:
**search quality, engine efficiency, token optimization, and deduplication effectiveness.**

## Query Set

- **30 queries** (15 English, 15 Chinese)
- Mix of: technical queries, news queries, general knowledge
- Designed to represent real AI agent usage patterns

## Metrics

| Metric | Definition |
|--------|-----------|
| **Success rate** | % of queries returning ≥1 result |
| **Latency (P50/P95)** | Total wall-clock time per query |
| **Avg engines/query** | Number of engines queried before waterfall stopped |
| **Waterfall saved** | Queries that stopped at phase 1 (≤2 engines) |
| **Avg confidence** | Mean confidence score across all results (0-1 scale) |
| **Dedup rate** | % of duplicate URLs removed |
| **Token savings** | % reduction vs estimated raw SERP text |

## Waterfall Search

Agent Search MCP uses a 3-phase waterfall:
1. Phase 1: DDG + Sogou (parallel)
2. Phase 2: Bing + Baidu (only if phase 1 insufficient)
3. Phase 3: Brave + Tavily + Exa (paid, only if needed)

Early stopping at phase 1 means the waterfall works as designed.

## Token Savings Estimation

"Raw SERP" is estimated per result as:
```
raw_chars = title_length + url_length + 300 (estimated snippet)
```

"Compressed" is the actual JSON output size. This is a conservative estimate since raw SERP pages typically return much more content (full abstracts, dates, source metadata).

## Environment

- Node.js v20.x
- Default config (no Brave/Tavily/Exa API keys)
- All 8 free engines enabled
- Network: standard internet connection (no proxy)

## Limitations

- Latency varies by network conditions
- No paid engines tested (requires API keys)
- Quality is measured by confidence scores, not human relevance judging
