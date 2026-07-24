# Benchmarks

Reproducible performance benchmarks for Agent Search MCP.

## Latest Results

| Metric | Value |
|--------|-------|
| Success rate | **100%** (30/30) |
| Waterfall efficiency | **100%** stopped at phase 1 |
| Avg engines per query | **2.0** |
| Date | 2026-07-23 |

[Full report →](./reports/2026-07-23.md)

## How to Run

```bash
node benchmarks/run.cjs
```

Output: console summary + JSON report in `reports/`.

## Contents

| File | Description |
|------|-------------|
| [`queries.json`](./queries.json) | 30 test queries (15 EN + 15 ZH) |
| [`run.cjs`](./run.cjs) | Benchmark runner script |
| [`methodology.md`](./methodology.md) | Testing methodology |
| [`reports/`](./reports) | Published benchmark reports |
