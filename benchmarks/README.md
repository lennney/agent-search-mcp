# Benchmarks

Agent Search MCP keeps three evidence tracks: historical live measurements,
deterministic formatting regression, and a human-gated search-quality pipeline.

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
| Average tokens | 2311.0 | 1655.8 | 1607.5 |
| Savings vs Normal | — | **28.4%** | **30.4%** |

The three scenarios enforce shared passage budgets of 1200, 600, and 360
characters respectively. This synthetic bilingual fixture verifies formatting,
evidence-packet semantics, and token-count regressions. It makes no
search-quality or live engine-efficiency claim.

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

## Human-gated search quality

Live capture now preserves a response SHA-256, per-engine outcomes, latency,
and disclosed failures. Prepare a label file without inventing judgments:

```bash
node benchmarks/quality.mjs \
  --prepare-capture benchmarks/fixtures/live-latest.json \
  --output benchmarks/fixtures/live-latest-labels.pending.json
```

Two people must review a non-empty pooled capture before its status can become
`human-verified`. The evaluator reports graded nDCG@5, Precision@5, reciprocal
rank@5, Success@5, answer correctness, citation support, tokens per correct
answer, latency, trace coverage, and failure disclosure. Language, category,
and freshness slices are emitted in JSON reports.

```bash
# Metric-code regression only; bootstrap data is not a quality claim
npm run benchmark:quality:verify

# Human gate for a completed fixture
node benchmarks/quality.mjs \
  --fixture benchmarks/fixtures/quality-human.json \
  --require-human \
  --output benchmarks/reports/quality-human.json
```

The 2026-07-26 real-network pilot returned zero results for both queries. It is
retained as failure-transparency evidence rather than excluded to improve the
headline number.

## Contents

| File | Description |
|------|-------------|
| [`queries.json`](./queries.json) | 30 bilingual live-search queries |
| [`run.mjs`](./run.mjs) | Current capture/replay runner |
| [`quality.mjs`](./quality.mjs) | Label preparation and quality evaluator |
| [`lib/quality-metrics.mjs`](./lib/quality-metrics.mjs) | Trace, validation, and independent metrics |
| [`fixtures/format-regression.json`](./fixtures/format-regression.json) | Frozen deterministic regression fixture |
| [`fixtures/quality-bootstrap.json`](./fixtures/quality-bootstrap.json) | Synthetic metric regression; never quality evidence |
| [`fixtures/live-p2-pilot.json`](./fixtures/live-p2-pilot.json) | Real zero-result failure pilot with raw traces |
| [`schemas/labeled-search-quality-v1.schema.json`](./schemas/labeled-search-quality-v1.schema.json) | Label/trace schema |
| [`methodology.md`](./methodology.md) | Evidence model and limitations |
| [`run.cjs`](./run.cjs) | Legacy historical runner |
| [`reports/`](./reports) | Historical and replay reports |
