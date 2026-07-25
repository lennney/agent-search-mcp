# Benchmark Methodology

## Evidence model

The benchmark separates live retrieval from deterministic output measurement.

1. **Capture:** each query invokes the production search orchestrator once and
   stores the untouched response, its SHA-256, latency, and per-engine outcomes.
2. **Replay:** normal, compact, and aggressive output styles format the same stored results.
3. **Count:** the locked `gpt-tokenizer` dependency counts serialized output tokens in-process.
4. **Check:** a fixture may contain an expected summary; `--check` fails on drift and is used by CI.

This design prevents network variance or different search results from being mistaken for formatting savings.

## Query and fixture sets

- `queries.json`: 30 live-search prompts, 15 English and 15 Chinese; primarily developer topics.
- `format-regression.json`: deterministic 10-query bilingual synthetic fixture used only for formatting and token regression.
- `quality-bootstrap.json`: synthetic metric-code regression with
  `quality_claim_eligible: false`.
- Live captures: environment-specific snapshots created with `--capture`; results with zero returned documents are excluded from savings summaries.
- Human quality fixtures: prepared from a traced live capture, independently
  reviewed by two people, adjudicated, and marked `human-verified`.
- Pooled captures: two or more systems run the identical sample IDs and query
  metadata. Pool generation rejects invalid response hashes, duplicate system
  IDs, or query-set drift.

## Metrics

| Metric | Definition |
|--------|------------|
| Token count | `gpt-tokenizer` count of the serialized formatted response |
| Token savings | Difference between styles when replaying the same captured result set |
| Engine calls | Actual adapter attempts reported by the production orchestrator |
| Early stop | Whether waterfall routing stopped before exhausting its eligible phase |
| Success | Query returned at least one result |
| nDCG@5 | Rank-aware gain from 0-3 human relevance labels |
| Precision@5 | Fraction of judged top-five results with relevance at least 2 |
| Reciprocal rank@5 | Reciprocal position of the first relevant top-five result |
| Citation support | Fraction of relevant results judged to support the expected answer |
| Tokens per correct answer | All serialized response tokens divided by correct answers |
| Failure disclosure | Failed trace outcomes represented in `partialFailures` |

Recall is not reported until candidate documents are pooled across systems.
Judging only one system's returned URLs cannot establish the total number of
relevant documents on the open web.

After completed adjudication, the comparison evaluator reconstructs each
system's original rank from the protected pool and uses the shared final
judgments as qrels. `pooled_recall_at_5_percent` is recall against the
adjudicated union pool only; it is never labeled web recall. nDCG uses the
pool-wide ideal ordering. Queries with no relevant pooled candidate are scored
zero and disclosed by `queries_with_relevant_pool`. Precision@5 always uses
the fixed five-result denominator; missing ranks count as non-relevant.

The search response is an evidence list, not a synthesized answer. Therefore
the pooled comparison does not infer answer correctness from relevance and
does not manufacture tokens-per-correct-answer. Those dimensions stay
explicitly unmeasured until a separately blinded per-system answer protocol
exists.

## Human labeling protocol

1. Pool results from the systems/configurations being compared.
2. Hide engine identity and ranking source.
3. Use two independent reviewers and the 0-3 relevance scale.
4. Judge answer correctness and citation support separately.
5. Retain both reviewers' per-result judgments, adjudicate disagreements, and
   retain reviewer IDs and timestamp.
6. Publish language, category, and freshness slices before any overall average.

Pooling canonicalizes HTTP(S) URLs by lowercasing the hostname, removing the
fragment and common tracking parameters, sorting remaining parameters, and
normalizing a trailing slash. It retains each system's original rank and raw
result hash in the protected pool, selects one deterministic display variant,
and assigns a URL-derived opaque candidate ID. Reviewer packets remove system
identity, original rank, internal scores, and traces.

`reviewer_slot` only controls deterministic packet permutation. A completed
packet additionally requires a non-empty human `reviewer.id` and parseable
completion timestamp. The import step requires two distinct human IDs, retains
both judgments, and marks disagreements for human adjudication. A completed
adjudication must retain all source judgments and provide a final label for
every candidate plus a named human adjudicator and timestamp.

## Historical result boundary

The 2026-07-24 30-query report measured 28.7% Compact savings, 35.5% Compact+ savings, and 75% fewer calls than naive eight-engine fan-out. It remains useful measured evidence, but cannot be regenerated byte-for-byte because its raw responses were not saved and its token fallback used `characters / 3`.

## Limitations

- The deterministic fixture validates formatting, not retrieval quality.
- The live query set has no human relevance labels and is weighted toward technical topics.
- The checked-in quality fixture is bootstrap-only. The checked-in non-empty
  reviewer pilot is single-system and pending human review; it is not a pooled
  quality comparison.
- Engine availability, rate limits, latency, and returned pages vary with network, geography, and time.
- Paid adapters require their API keys and are omitted when unavailable.
- Historical and current replay percentages describe different fixtures and token counters; neither is a production guarantee.
