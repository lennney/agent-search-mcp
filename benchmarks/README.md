# Benchmarks

Reproducible benchmarks measuring search quality, engine efficiency, and token optimization.

## Latest Results (2026-07-24)

30 queries (15 EN + 15 ZH), default config, no API keys. Token counts via character estimation (~1 token per 3 chars).

| Metric | Normal | Compact | Compact+ |
|--------|--------|---------|----------|
| **Success rate** | 100% | 100% | 96.7% |
| **Avg engines** | 2.0 | 2.0 | 2.0 |
| **Waterfall phase 1** | 100% | 100% | 100% |
| **Avg tokens** | 1582 | 1128 | 1020 |
| **Token savings vs Normal** | — | **28.7%** | **35.5%** |
| **Avg latency** | 15.2s | 16.6s | 16.2s |
| **P50 latency** | 14.8s | 16.3s | 15.9s |
| **P95 latency** | 18.4s | 19.9s | 19.3s |

→ [Full report](./reports/2026-07-24.md) · [JSON data](./reports/2026-07-24.json)

Key findings:
- **100% waterfall efficiency** — every query satisfied at phase 1 (2 engines). Saves 75% vs naive 8-engine search.
- **28.7% token reduction** with compact mode (progressive disclosure + metadata stripping)
- **35.5% token reduction** with aggressive settings (compact + 120-char snippets)
- **0% URL overlap** between DDG and Sogou — genuine multi-source diversity

### Historical

| Date | Success | Tokens (Normal) | Compact Savings | Report |
|------|---------|-----------------|-----------------|--------|
| 2026-07-24 | 100% | 1582 | 28.7% | [report](./reports/2026-07-24.md) |
| 2026-07-23 | 100% | — | 6.7% (bytes) | [report](./reports/2026-07-23.md) |

## How to Run

```bash
# Build first
npm run build

# Run benchmarks (3 scenarios: normal, compact, compact+aggressive)
node benchmarks/run.cjs
```

**Optional: install tiktoken for precise token counts** (otherwise falls back to character estimation):

```bash
pip install tiktoken
```

## Scenarios Tested

| Scenario | OUTPUT_STYLE | MAX_FULL_RESULTS | SNIPPET_LENGTH |
|----------|-------------|-----------------|----------------|
| Normal | (default) | — | 200 |
| Compact | compact | 3 | 200 |
| Compact Aggressive | compact | 3 | 120 |

## Contents

| File | Description |
|------|-------------|
| [`queries.json`](./queries.json) | 30 test queries (15 EN + 15 ZH, tech/news/general) |
| [`run.cjs`](./run.cjs) | Benchmark runner with optional tiktoken support |
| [`methodology.md`](./methodology.md) | Testing methodology |
| [`reports/`](./reports) | Published benchmark reports |
