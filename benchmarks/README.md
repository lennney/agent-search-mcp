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

The capture runner accepts a dedicated query set and an explicit comma-separated
engine allowlist. The selected engines are recorded in the fixture and are
honored by waterfall execution:

```bash
node benchmarks/run.mjs \
  --capture benchmarks/fixtures/live-reviewer-pilot.json \
  --query-set benchmarks/queries/reviewer-pilot.json \
  --engines wikipedia
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

Build a deterministic pool from captures of the same query set. Every capture
must retain a valid raw-response trace. `system-id` is stored in the protected
pool, but is removed from reviewer packets:

```bash
node benchmarks/pool.mjs \
  --capture agent-search=benchmarks/fixtures/agent-search-live.json \
  --capture comparison=benchmarks/fixtures/comparison-live.json \
  --output benchmarks/fixtures/search-pool.json

node benchmarks/quality.mjs \
  --prepare-reviewer-packet benchmarks/fixtures/search-pool.json \
  --reviewer-slot reviewer-a \
  --output benchmarks/reviews/search-pool.reviewer-a.pending.json

node benchmarks/quality.mjs \
  --prepare-reviewer-packet benchmarks/fixtures/search-pool.json \
  --reviewer-slot reviewer-b \
  --output benchmarks/reviews/search-pool.reviewer-b.pending.json
```

Each person must fill `reviewer.id`, keep `reviewer.kind` as `human`, fill
`reviewer.completed_at`, and judge every candidate. Reviewer slots are packet
labels, not proof of a human identity. Create the disagreement artifact only
after both reviews are complete:

```bash
node benchmarks/pool.mjs \
  --prepare-adjudication benchmarks/fixtures/search-pool.json \
  --review benchmarks/reviews/search-pool.reviewer-a.completed.json \
  --review benchmarks/reviews/search-pool.reviewer-b.completed.json \
  --output benchmarks/reviews/search-pool.adjudication.pending.json

# After a human resolves every final judgment and records the adjudicator:
node benchmarks/pool.mjs \
  --verify-adjudication benchmarks/reviews/search-pool.adjudication.completed.json

# Reconstruct each protected system ranking and write the comparison:
node benchmarks/pool.mjs \
  --compare benchmarks/fixtures/search-pool.json \
  --adjudication benchmarks/reviews/search-pool.adjudication.completed.json \
  --output benchmarks/reports/search-pool.comparison.json
```

The comparison reports nDCG@5, Precision@5, pooled Recall@5, reciprocal rank,
Success@5, citation support, latency, and failure disclosure per system and
slice. Recall is explicitly relative to the adjudicated union pool, not the
open web. Queries whose pool contains no relevant candidate score zero and are
counted separately. Precision@5 uses a fixed denominator of five, so returning
fewer results cannot inflate the score. Because the search tool returns evidence rather than a
synthesized answer, answer accuracy and tokens per correct answer are marked
unmeasured instead of inferred from retrieval relevance.

`human-verified` means the judgments and adjudication passed the evidence
contract; it does not automatically authorize a public quality headline.
`quality_claim_eligible` remains false until at least 30 adjudicated queries
and 30 distinct normalized query texts are present; duplicating a query cannot
satisfy the floor. Each language/category/freshness slice carries its own readiness
status and requires at least 10 rows and 10 distinct queries. These are conservative minimum
publication guardrails aligned with the checked-in 30-query benchmark, not a
claim that statistical power or population representativeness is automatically
adequate.
Normalization uses Unicode NFKC, collapsed whitespace, and case folding.

Before adjudication, the artifact also reports reviewer reliability:
all-reviewer raw agreement, mean pairwise quadratic-weighted Cohen's kappa for
the ordinal 0-3 relevance labels, and mean pairwise Cohen's kappa for binary
citation support. A kappa is `null` when a reviewer pair has no label variance;
the report keeps the raw agreement and `defined_pairs` count instead of
converting an undefined statistic to perfect agreement. Low agreement remains
visible and is resolved through adjudication rather than silently dropping
queries.

For the current single-system qualification artifact, generate separate
blinded packets with:

```bash
npm run benchmark:reviewer-pilot:prepare
npm run benchmark:reviewer-pilot:verify
```

Reviewer packets retain publisher URLs, titles, snippets, the question, and
the reference answer, but omit search-adapter/ranking provenance, internal
relevance and confidence, source counts, and execution traces. Opaque candidate
IDs and a deterministic reviewer-specific permutation avoid exposing the
original rank. Required publisher attribution remains visible.
The current reviewer pilot is a single-engine runner qualification artifact,
not yet the multi-system pool required for public Recall or quality claims.

Retrieved content has its own license boundary. See
[`DATA_LICENSES.md`](./DATA_LICENSES.md); do not assume the repository's Apache
license covers captured third-party snippets.

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
| [`pool.mjs`](./pool.mjs) | Deterministic multi-system pooling and human adjudication gate |
| [`lib/pooling.mjs`](./lib/pooling.mjs) | Pool URL normalization, trace preservation, and completed-review validation |
| [`lib/comparison-metrics.mjs`](./lib/comparison-metrics.mjs) | Per-system pooled-qrels comparison metrics and evidence gates |
| [`lib/quality-metrics.mjs`](./lib/quality-metrics.mjs) | Trace, validation, and independent metrics |
| [`fixtures/format-regression.json`](./fixtures/format-regression.json) | Frozen deterministic regression fixture |
| [`fixtures/quality-bootstrap.json`](./fixtures/quality-bootstrap.json) | Synthetic metric regression; never quality evidence |
| [`fixtures/live-p2-pilot.json`](./fixtures/live-p2-pilot.json) | Real zero-result failure pilot with raw traces |
| [`fixtures/live-reviewer-pilot.json`](./fixtures/live-reviewer-pilot.json) | Real non-empty single-engine reviewer-pipeline qualification capture |
| [`queries/reviewer-pilot.json`](./queries/reviewer-pilot.json) | Bilingual reviewer-pilot questions and reference answers |
| [`reviews/`](./reviews) | Blinded, pending reviewer packets |
| [`schemas/labeled-search-quality-v1.schema.json`](./schemas/labeled-search-quality-v1.schema.json) | Label/trace schema |
| [`schemas/pooled-search-comparison-v1.schema.json`](./schemas/pooled-search-comparison-v1.schema.json) | Completed pooled comparison report schema |
| [`methodology.md`](./methodology.md) | Evidence model and limitations |
| [`run.cjs`](./run.cjs) | Legacy historical runner |
| [`reports/`](./reports) | Historical and replay reports |
