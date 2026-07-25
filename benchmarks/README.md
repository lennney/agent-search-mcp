# Benchmarks

Agent Search MCP keeps two complementary evidence tracks: a historical live-search measurement and a deterministic formatting regression benchmark.

## Historical live result (2026-07-24)

The original runner completed 30 queries (15 EN + 15 ZH), with no paid API keys. It measured:

| Metric | Normal | Compact | Compact+ |
|--------|-------:|--------:|---------:|
| Success rate | 100% | 100% | 96.7% |
| Average estimated tokens | 1582 | 1128 | 1020 |
| Savings vs Normal | — | **28.7%** | **35.5%** |
| Average latency | 15.2s | 16.6s | 16.2s |

The run also reported two average engines per query, equivalent to **75% fewer calls than naive eight-engine fan-out**. These are real measurements for that query set, runner, and network environment. The raw responses were not frozen, the token fallback was `characters / 3`, and the output scenarios used separate live requests, so the exact figures are retained as scoped historical evidence rather than universal guarantees.

[Full report](./reports/2026-07-24.md) · [JSON data](./reports/2026-07-24.json)

## Reproducible fixture replay

The current runner replays the same frozen results through all output styles with the locked in-process `gpt-tokenizer`. CI compares the generated summary with the fixture's expected values.

| Metric | Normal | Compact | Compact+ |
|--------|-------:|--------:|---------:|
| Average tokens | 2122.0 | 1480.3 | 1401.7 |
| Savings vs Normal | — | **30.2%** | **33.9%** |

This synthetic bilingual fixture verifies formatting, field semantics, and token-count regressions. It makes no search-quality or live engine-efficiency claim.

```bash
# Deterministic replay; fails if the expected summary changes
npm run benchmark:verify

# Replay and write a report
npm run benchmark

# Capture real search responses and execution telemetry (network required)
npm run benchmark:capture
```

Live capture records searched engines, calls, completed phases, early stop, raw results, and tokenizer identity once per query. A captured fixture can then be replayed without network variance:

```bash
node benchmarks/run.mjs --fixture benchmarks/fixtures/live-latest.json
```

## Contents

| File | Description |
|------|-------------|
| [`queries.json`](./queries.json) | 30 bilingual live-search queries |
| [`run.mjs`](./run.mjs) | Current capture/replay runner |
| [`fixtures/format-regression.json`](./fixtures/format-regression.json) | Frozen deterministic regression fixture |
| [`methodology.md`](./methodology.md) | Evidence model and limitations |
| [`run.cjs`](./run.cjs) | Legacy historical runner |
| [`reports/`](./reports) | Historical and replay reports |
