# Benchmark Methodology

## Overview

The current benchmark runner measures live-query completion, wall-clock latency, and approximate serialized output size. Engine efficiency, search quality, token savings, and deduplication effectiveness require additional telemetry or labeled fixtures and are not yet validated by this runner.

## Query Set

- **30 queries** (15 English, 15 Chinese)
- 29 technical queries and 1 news query
- Useful as a bilingual developer-search smoke set; not representative of general AI-agent traffic

## Metrics

| Metric | Definition |
|--------|-----------|
| **Success rate** | % of queries returning ≥1 result |
| **Latency (P50/P95)** | Total wall-clock time per query |
| **Approx output size** | Serialized JSON characters divided by 3 unless optional Python tiktoken is available |

## Token Savings Estimation

The fallback estimate (`characters / 3`) is intentionally rough and is especially unreliable for a 50/50 English-Chinese corpus. Normal, compact, and aggressive scenarios currently perform separate live searches, so differences may reflect different search results rather than formatting alone.

## Environment

- Node.js v20.x
- Default config (no Brave/Tavily/Exa API keys)
- No paid API keys
- Network: standard internet connection (no proxy)

## Limitations

- Latency varies by network conditions
- No paid engines tested (requires API keys)
- No human relevance labels or answer-key scoring
- No actual attempted/successful engine-call telemetry
- The CLI path used by the runner does not explicitly enable waterfall mode
- Scenarios do not reuse a frozen raw-result fixture
- Historical token percentages are estimates, not production guarantees
