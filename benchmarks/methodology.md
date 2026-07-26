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
- Reviewed quality fixtures: prepared from traced live captures, independently
  judged by two different AI model families and adjudicated by a third family.
  Legacy human review remains supported, but AI output is marked `ai-reviewed`.
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
| nDCG@5 | Rank-aware gain from adjudicated 0-3 relevance labels |
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

## Claim readiness

Review completion and public-claim readiness are separate states. A completed
two-reviewer adjudication establishes label provenance, but the default report
keeps `quality_claim_eligible: false` below 30 adjudicated queries. Individual
reports also require 30 distinct normalized query texts, so repeated copies
cannot satisfy the floor. Individual language, category, and freshness slices
require at least 10 rows and 10 distinct queries and carry
their own readiness status. Zero-result queries remain in those counts.
Distinct-query counting applies Unicode NFKC normalization, trims and collapses
whitespace, and ignores case, so full-width/case/spacing variants cannot inflate
coverage.

The 30/10 thresholds are versioned minimum publication guardrails chosen to
prevent tiny pilots from becoming headline comparisons and to align the
overall floor with the existing 30-query benchmark. They do not prove adequate
statistical power, query-population representativeness, or practical
significance; those still require benchmark-specific review.

## Paired uncertainty

Comparisons resample queries as paired observations because every system is
evaluated on the same query IDs. Once the overall 30-row and 30-distinct-query
floor is met, each system pair receives 2,000 deterministic paired-bootstrap
resamples and a percentile 95% confidence interval. The reported delta is
always left system minus right system. Retrieval deltas are percentage points
with higher values preferred; latency deltas are milliseconds with lower
values preferred.

The seed is derived from the pool hash, adjudication hash, and system pair.
This makes reports reproducible without pretending the observed query set is a
random sample of every future workload. Below the floor, the comparison is
`insufficient-sample` and does not emit an inferred interval. An interval that
crosses zero shows that the observed direction is uncertain; an interval that
does not cross zero still does not establish causality, universal superiority,
query-population coverage, or practical significance.

## AI review protocol

1. Pool results from the systems/configurations being compared.
2. Hide engine identity and ranking source.
3. Judge one candidate at a time with the fixed 0-3 rubric, so candidate order
   cannot become an A/B preference signal.
4. Use two different model families at temperature zero, then a third family
   to judge disagreements from scratch without seeing the earlier verdicts.
5. Retain provider/model family, prompt/version hashes, structured verdict
   hashes, short rationales, usage, and timestamps.
6. Publish language, category, and freshness slices before any overall average.

Pooling canonicalizes HTTP(S) URLs by lowercasing the hostname, removing the
fragment and common tracking parameters, sorting remaining parameters, and
normalizing a trailing slash. It retains each system's original rank and raw
result hash in the protected pool, selects one deterministic display variant,
and assigns a URL-derived opaque candidate ID. Reviewer packets remove system
identity, original rank, internal scores, and traces.

`reviewer_slot` only controls deterministic packet permutation. It is not an
independent judge identity. AI packets require distinct model families,
temperature zero, a fixed prompt hash, per-verdict request/response hashes, and
a parseable completion timestamp. For dated snapshot IDs, the family is
derived by removing the trailing `-YYYY-MM-DD`, rather than trusting an
arbitrary operator label. The adjudicator must use a third model family. Human
packets remain accepted for backward compatibility, but review modes cannot be
mixed within one adjudication.

Candidate text is untrusted input and is sent as data, not instructions.
Oversized fields are rejected rather than silently truncated. The OpenAI
Responses driver uses strict JSON Schema, disables tools, and sends
`store: false`. URLs sent to the judge retain only origin and pathname; user
info, query parameters, and fragments are removed. Users must still review
their provider and organization data-retention policy. API keys are read only
from environment variables and are never written into review artifacts.

Reviewer reliability is calculated before adjudication. Relevance uses the
mean pairwise quadratic-weighted Cohen's kappa because the 0-3 grades are
ordinal; citation support uses mean pairwise unweighted Cohen's kappa because
it is binary. Raw all-reviewer agreement and the number of defined reviewer
pairs are reported alongside kappa. When both reviewers use only one category,
chance agreement has no variance and kappa is reported as `null`, not 1.
Agreement metrics are evidence to disclose, not a filter for removing hard
queries; all disagreements remain in the adjudication artifact.

## Routing relevance calibration

The protected pool stores each system's internal `relevance`, `confidence`,
and `source_count` with its original rank. These signals never enter blinded
reviewer packets. After adjudication is completed, the calibrator joins the
selected system's relevance signal to the final 0-3 qrel and treats grades 2
and 3 as relevant.

The threshold curve uses fixed 0.05 steps from 0 to 1 and always includes the
current threshold. The default selection policy requires precision of at least
0.8, then maximizes recall, precision, and F1 in that order; exact ties choose
the higher threshold. A formal recommendation requires at least 10 distinct
queries, 30 judged returned candidates, and both positive and negative labels.
Smaller runs retain the full diagnostic curve but return no recommended
threshold. Calibration is an internal routing decision and does not make the
run eligible for a public search-quality claim.

## Historical result boundary

The 2026-07-24 30-query report measured 28.7% Compact savings, 35.5% Compact+ savings, and 75% fewer calls than naive eight-engine fan-out. It remains useful measured evidence, but cannot be regenerated byte-for-byte because its raw responses were not saved and its token fallback used `characters / 3`.

## Limitations

- The deterministic fixture validates formatting, not retrieval quality.
- The live query set has no completed relevance labels and is weighted toward technical topics.
- The checked-in quality fixture is bootstrap-only. The checked-in non-empty
  reviewer pilot is single-system and has no completed AI review; it is not a pooled
  quality comparison.
- LLM judges can be consistent while still biased. `ai-reviewed` results must
  not be described as human ground truth, and same-family judges are rejected.
- Engine availability, rate limits, latency, and returned pages vary with network, geography, and time.
- Paid adapters require their API keys and are omitted when unavailable.
- Historical and current replay percentages describe different fixtures and token counters; neither is a production guarantee.
