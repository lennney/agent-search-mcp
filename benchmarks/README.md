# Benchmarks

Exploratory performance snapshots for Agent Search MCP.

> **Status:** the current runner is useful for smoke tests and latency snapshots, but it is not yet a release-grade quality or token benchmark. It does not record actual per-engine calls, the three output scenarios run against different live result sets, and the default token counter is a character estimate. Historical percentages below are preserved for reproducibility, not presented as guaranteed savings.

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

Do not use `Avg engines`, `Waterfall phase 1`, or the savings percentages as product claims until the runner records actual engine-call telemetry and formats the same captured result fixtures in every scenario.

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
| [`queries.json`](./queries.json) | 30 test queries (15 EN + 15 ZH; 29 tech, 1 news) |
| [`run.cjs`](./run.cjs) | Benchmark runner with optional tiktoken support |
| [`methodology.md`](./methodology.md) | Testing methodology |
| [`reports/`](./reports) | Published benchmark reports |
