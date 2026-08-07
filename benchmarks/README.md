# Benchmarks

Agent Search MCP keeps three evidence tracks: historical live measurements,
deterministic formatting regression, and a review-gated search-quality pipeline.

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

## Runner qualification

Before paying for AI review, qualify the network exit with a small, private
adapter-level probe. A query qualifies only when two named configurations are
both non-empty, their union covers at least two provider families, and their
candidate/ranking shapes differ:

```bash
npm run benchmark:qualify-runner -- \
  --system duckduckgo-web=duckduckgo \
  --system wikipedia=wikipedia \
  --limit 10 \
  --minimum-queries 10 \
  --query-delay-ms 10000 \
  --output benchmarks/reports/runner-qualification-2026-07-26-local.json
```

The checked-in local observation was `ready` for 10/10 bilingual calibration
queries. The report stores query IDs, hashes, provider families, failure types,
counts, and durations; it omits query text, titles, URLs, snippets, and bodies.
This gate proves only that a runner can create a non-empty, diverse pool. It is
not a product comparison, a relevance judgment, or a public quality claim.
The command exits with code `2` when the report is `insufficient-runner`, while
still writing the privacy-preserving diagnostic report. Capture/review
automation must stop on that non-zero exit.
The probe waits 10 seconds between query groups by default and accepts only
`1000..60000` milliseconds. It never retries a failed query automatically.

External comparison systems stay outside the product runtime. Export their
already-captured results as `external-search-results` JSON, disclose the
retention license under the system ID, then normalize them offline:

```bash
npm run benchmark:import-external -- \
  --input private/comparison-export.json \
  --query-set benchmarks/queries/routing-calibration.json \
  --output benchmarks/fixtures/comparison-live.json
```

The export contains `system: { id, version }`, `captured_at`,
`content_licenses`, and ordered `samples`. Each sample has the query-set `id`,
`duration_ms`, and exactly one of `results` or an enumerated `failure_type`
(`timeout`, `rate_limited`, `permission_denied`, `upstream_error`,
`unavailable`, or `unknown`); a result contains only `title`, HTTP(S) `url`, and
optional `snippet`. Arbitrary provider error text is never retained. The
importer takes query text and review metadata from the repository query set,
bounds retained fields, hashes the source export, and emits the same traced
`live-capture` contract used by pooling. It performs no provider request.

## Offline Search Evidence Demo

Run the public, deterministic contract demo without contacting a search source:

```bash
npm run demo:evidence
npm run demo:evidence -- --json
```

The fixture in `fixtures/evidence-demo.json` is entirely synthetic and passes
three bounded scenarios through the production evidence evaluator, result
formatter, and MCP output helper. It demonstrates that DuckDuckGo and Bing do
not count as two provider families for the same URL, fallback failures remain
visible, and a satisfied quality gate can stop later work. The text
compatibility view is measured against canonical `structuredContent` and must
retain every displayed URL, the provider-family signals of non-compacted
results, and every partial-failure type. Full routing and evidence metadata
remains in canonical `structuredContent`.

The runner reads checked-in files only. It does not import an engine adapter,
launch a subprocess, install a competitor, call a model, write an artifact, or
perform a network request. Its report is fixed to
`quality_claim_eligible: false`; it is evidence of response-contract behavior,
not live availability or search quality.

## Three-system bilingual comparison contract

The offline preparation suite preregisters 30 evergreen developer queries in
[`queries/competitive-comparison-v1.json`](./queries/competitive-comparison-v1.json):
15 English and 15 Chinese, with ten factual, ten technical, and ten
navigational cases. Every item includes a stable ID, a judgment question, an
original paraphrased reference answer, and at least one HTTP(S) official
reference source.

```bash
npm run benchmark:competitive:validate
npm run benchmark:competitive:dry-run
```

The validator rejects stratum drift, duplicate normalized queries, missing
reference fields, non-HTTP(S) sources, years, freshness/news terms, and the
compared systems' brands. The dry run performs no network request, subprocess
launch, competitor install, or artifact write. It prints the fixed
three-system manifest and 90-call Latin-square schedule.

On a separately approved clean runner, `--execute` requires one executable
driver and one result-content license disclosure per system plus an absolute
`--output-root` outside the repository. Drivers receive one bounded JSON
request on stdin and return one pinned-version JSON result on stdout. The
controller never invokes a shell, does not forward API keys or proxy variables,
does not retry, and writes a private checkpoint after every call. Competitor
installation and driver implementation remain outside this repository.

The formal Agent Search profile is derived from the runtime engine registry
and fixes `free_only`, all nine zero-key adapters, waterfall routing, Top-5,
no enrichment, no query expansion, a 10-second inter-call delay, and no retry.
External profiles pin Open-WebSearch `2.1.9` and DDGS `9.14.4`. A
`bot_challenge` or `rate_limited` result checkpoints and aborts the round;
timeouts and empty results remain ordinary samples. Formal pooling adds
`--require-complete` and accepts only complete capture-contract-v2 inputs;
legacy fixtures remain replayable without that flag.

Raw exports, normalized captures, pools, and review packets belong in a
private directory outside the repository. The repository may retain the query
set, code, synthetic tests, and aggregate candidates containing no retrieved
text. See [`DATA_LICENSES.md`](./DATA_LICENSES.md).

## Review-gated search quality

Live capture now preserves a response SHA-256, per-engine outcomes, latency,
and disclosed failures. The automated AI path starts from the pooled captures
below. For the optional legacy human workflow, prepare a label file without
inventing judgments:

```bash
node benchmarks/quality.mjs \
  --prepare-capture benchmarks/fixtures/live-latest.json \
  --output benchmarks/fixtures/live-latest-labels.pending.json
```

The default automated path requires two pointwise AI judges from different
model families plus a third-family adjudicator. Its status is `ai-reviewed`;
legacy human review remains supported as `human-verified`. The evaluator reports graded nDCG@5, Precision@5, reciprocal
rank@5, Success@5, citation support, latency, trace coverage, and failure
disclosure. Answer correctness and tokens per correct answer remain report
dimensions but are marked unmeasured when the system returns evidence rather
than a synthesized answer. Language, category, and freshness slices are
emitted in JSON reports.

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

For automated judging, set `OPENAI_API_KEY` outside command history. The fixed
profiles use `gpt-4.1-2025-04-14` for Judge A,
`gpt-4o-mini-2024-07-18` for Judge B, and `gpt-4o-2024-11-20` only for
disagreements. The driver evaluates one blinded candidate per request, uses
strict JSON Schema, limits output to 384 tokens, disables tools, sends
`store: false`, and checkpoints before the first call and after every verdict:

```bash
# Verify all three pinned schemas before a full paid stage:
npm run benchmark:ai-review -- --schema-smoke --profile judge-a --output private/smoke-a.json
npm run benchmark:ai-review -- --schema-smoke --profile judge-b --output private/smoke-b.json
npm run benchmark:ai-review -- --schema-smoke --profile adjudicator --output private/smoke-c.json

npm run benchmark:ai-review -- \
  --review private/search-pool.json \
  --profile judge-a \
  --output private/search-pool.judge-a.json

npm run benchmark:ai-review -- \
  --review private/search-pool.json \
  --profile judge-b \
  --output private/search-pool.judge-b.json

# Resume a checkpoint with the exact same policy:
npm run benchmark:ai-review -- \
  --review private/search-pool.json \
  --profile judge-a \
  --resume private/search-pool.judge-a.json \
  --output private/search-pool.judge-a.json
```

Resume accepts only verdicts whose request, verdict, response, model, prompt,
pool, budget, pricing, and configuration evidence still match. Each profile
has a stage budget ($12, $3, and $15 respectively); the application reserves
the next bounded call before sending it and records actual token usage and
estimated cost. Budget exhaustion, HTTP 429, or API failure retains the last
checkpoint and exits without retrying, changing models, or increasing cost.
The OpenAI project used for the run must separately enforce a US$30 hard
spending limit. If a snapshot or price no longer matches the recorded policy,
stop and update the evidence snapshot instead of substituting silently.

The fixed execution order is: three schema smokes, both full pointwise review
stages, pending-adjudication generation, third-model disagreement
adjudication, contract verification, pooled comparison, then internal
relevance calibration.

Create the disagreement artifact after both reviews complete:

```bash
node benchmarks/pool.mjs \
  --prepare-adjudication benchmarks/fixtures/search-pool.json \
  --review benchmarks/reviews/search-pool.judge-a.completed.json \
  --review benchmarks/reviews/search-pool.judge-b.completed.json \
  --output benchmarks/reviews/search-pool.adjudication.pending.json

# Use a third model family to resolve only disagreements:
npm run benchmark:ai-review -- \
  --adjudicate benchmarks/reviews/search-pool.adjudication.pending.json \
  --pool benchmarks/fixtures/search-pool.json \
  --profile adjudicator \
  --output benchmarks/reviews/search-pool.adjudication.completed.json

node benchmarks/pool.mjs \
  --verify-adjudication benchmarks/reviews/search-pool.adjudication.completed.json

# Reconstruct each protected system ranking and write the comparison:
node benchmarks/pool.mjs \
  --compare benchmarks/fixtures/search-pool.json \
  --adjudication benchmarks/reviews/search-pool.adjudication.completed.json \
  --output benchmarks/reports/search-pool.comparison.json

# Calibrate the internal routing relevance floor from the same completed qrels:
npm run benchmark:calibrate-relevance -- \
  --pool benchmarks/fixtures/search-pool.json \
  --adjudication benchmarks/reviews/search-pool.adjudication.completed.json \
  --system-id agent-search \
  --output benchmarks/reports/agent-search.relevance-calibration.json
```

The comparison reports nDCG@5, Precision@5, pooled Recall@5, reciprocal rank,
Success@5, citation support, latency, and failure disclosure per system and
slice. Recall is explicitly relative to the adjudicated union pool, not the
open web. Queries whose pool contains no relevant candidate score zero and are
counted separately. Precision@5 uses a fixed denominator of five, so returning
fewer results cannot inflate the score. Because the search tool returns evidence rather than a
synthesized answer, answer accuracy and tokens per correct answer are marked
unmeasured instead of inferred from retrieval relevance.

The protected pool retains each system's internal `relevance`, `confidence`,
and `source_count` beside its rank and raw-result hash. Reviewer packets omit
all of those routing signals. The calibration command joins only a completed
adjudication back to the selected system's protected scores. It emits a
deterministic threshold curve, but withholds a recommendation below 10
distinct queries, 30 judgments, or when either relevant or non-relevant labels
are absent. This small internal calibration gate is separate from the stricter
30-query public-comparison gate.

`ai-reviewed` or `human-verified` means the corresponding judgments and
adjudication passed the evidence contract; neither automatically authorizes a
public quality headline. AI reports always carry `claim_scope: ai-judged` and
must not be described as human ground truth.
`quality_claim_eligible` remains false until at least 30 adjudicated queries
and 30 distinct normalized query texts are present; duplicating a query cannot
satisfy the floor. Each language/category/freshness slice carries its own readiness
status and requires at least 10 rows and 10 distinct queries. These are conservative minimum
publication guardrails aligned with the checked-in 30-query benchmark, not a
claim that statistical power or population representativeness is automatically
adequate.
Normalization uses Unicode NFKC, collapsed whitespace, and case folding.

Every system pair receives a query-paired comparison. Below the overall
30-distinct-query floor it is explicitly marked `insufficient-sample`. At or
above the floor, the report uses 2,000 deterministic paired-bootstrap
resamples and emits percentile 95% confidence intervals for the left-minus-right
delta in nDCG@5, Precision@5, pool-relative Recall@5, reciprocal rank,
Success@5, and latency. Retrieval deltas are percentage points and higher is
better; latency is milliseconds and lower is better. The evidence hashes and
system IDs seed the resampling, so the same evidence produces the same report.
All required system pairs must have uncertainty reported before
`quality_claim_eligible` can become true.

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

## Intent-routing experiment

`npm run benchmark:intent-routing` checks a dependency-free classifier against
32 bilingual docs/news/code/general contract cases and records candidate route
changes, latency, and RSS. This synthetic fixture is not search-quality
evidence; the candidate stays outside MCP/CLI routing until completed pooled
results prove a quality gain.

## Contents

| File | Description |
|------|-------------|
| [`queries.json`](./queries.json) | 30 bilingual live-search queries |
| [`queries/competitive-comparison-v1.json`](./queries/competitive-comparison-v1.json) | Preregistered 30-query bilingual evergreen comparison contract |
| [`run.mjs`](./run.mjs) | Current capture/replay runner |
| [`evidence-demo.mjs`](./evidence-demo.mjs) | Zero-network synthetic Search Evidence Packet demo |
| [`competitive-capture.mjs`](./competitive-capture.mjs) | Fail-closed zero-network competitive plan dry run |
| [`validate-competitive-query-set.mjs`](./validate-competitive-query-set.mjs) | Competitive query contract validator |
| [`quality.mjs`](./quality.mjs) | Label preparation and quality evaluator |
| [`pool.mjs`](./pool.mjs) | Deterministic multi-system pooling and same-mode adjudication gate |
| [`ai-review.mjs`](./ai-review.mjs) | OpenAI Responses executor for two-model review and third-model adjudication |
| [`calibrate-relevance.mjs`](./calibrate-relevance.mjs) | Completed-qrels calibration for the internal routing relevance floor |
| [`intent-routing.mjs`](./intent-routing.mjs) | Advisory classifier and candidate-route regression gate |
| [`lib/ai-review.mjs`](./lib/ai-review.mjs) | Provider-neutral pointwise judge contract and evidence hashing |
| [`lib/competitive-ai-policy.mjs`](./lib/competitive-ai-policy.mjs) | Fixed three-model snapshots, pricing evidence, and stage budgets |
| [`lib/competitive-capture.mjs`](./lib/competitive-capture.mjs) | Latin-square controller with injectable clean-runner adapters |
| [`lib/competitive-driver.mjs`](./lib/competitive-driver.mjs) | Pinned subprocess protocol and private-output boundary |
| [`lib/evidence-demo.mjs`](./lib/evidence-demo.mjs) | Deterministic evidence-demo builder and contract verifier |
| [`lib/capture-contract.mjs`](./lib/capture-contract.mjs) | Complete-capture and terminal-failure contract |
| [`lib/pooling.mjs`](./lib/pooling.mjs) | Pool URL normalization, trace preservation, and completed-review validation |
| [`lib/relevance-calibration.mjs`](./lib/relevance-calibration.mjs) | Deterministic threshold curve, readiness gate, and recommendation policy |
| [`lib/comparison-metrics.mjs`](./lib/comparison-metrics.mjs) | Per-system pooled-qrels comparison metrics and evidence gates |
| [`lib/quality-metrics.mjs`](./lib/quality-metrics.mjs) | Trace, validation, and independent metrics |
| [`fixtures/format-regression.json`](./fixtures/format-regression.json) | Frozen deterministic regression fixture |
| [`fixtures/evidence-demo.json`](./fixtures/evidence-demo.json) | Synthetic provider-family, failure, and bounded-stop demo scenarios |
| [`fixtures/url-canonicalization-calibration-v1.json`](./fixtures/url-canonicalization-calibration-v1.json) | Synthetic URL-identity calibration; v2 candidate evidence only, not a production switch |
| [`fixtures/quality-bootstrap.json`](./fixtures/quality-bootstrap.json) | Synthetic metric regression; never quality evidence |
| [`fixtures/live-p2-pilot.json`](./fixtures/live-p2-pilot.json) | Real zero-result failure pilot with raw traces |
| [`fixtures/live-reviewer-pilot.json`](./fixtures/live-reviewer-pilot.json) | Real non-empty single-engine reviewer-pipeline qualification capture |
| [`queries/reviewer-pilot.json`](./queries/reviewer-pilot.json) | Bilingual reviewer-pilot questions and reference answers |
| [`queries/routing-calibration.json`](./queries/routing-calibration.json) | Ten bilingual evergreen queries for internal routing calibration |
| [`queries/intent-routing.json`](./queries/intent-routing.json) | Synthetic bilingual intent-routing contract cases |
| [`reviews/`](./reviews) | Blinded, pending reviewer packets |
| [`schemas/labeled-search-quality-v1.schema.json`](./schemas/labeled-search-quality-v1.schema.json) | Label/trace schema |
| [`schemas/pooled-search-comparison-v1.schema.json`](./schemas/pooled-search-comparison-v1.schema.json) | Completed pooled comparison report schema |
| [`methodology.md`](./methodology.md) | Evidence model and limitations |
| [`run.cjs`](./run.cjs) | Legacy historical runner |
| [`reports/`](./reports) | Historical and replay reports |
