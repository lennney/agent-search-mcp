# Multi-system search review pooling contract

Date: 2026-07-26

## Outcome

Agent Search now has an executable, deterministic contract for creating a
candidate pool from two or more search-system captures and carrying that pool
through blinded independent review and adjudication.

This is workflow evidence, not search-quality evidence. No independent
comparison-system capture or completed AI judgment was created as part of this
change.

## Protected pool

`benchmarks/pool.mjs` accepts repeated `system-id=capture-path` inputs. The
library rejects:

- fewer than two systems;
- duplicate or unstable system IDs;
- empty or invalid live captures;
- response hashes that do not match the stored raw response;
- sample-ID/order or query-metadata drift;
- duplicate canonical URLs within one system/query.

The pool removes common tracking parameters and URL fragments for
deduplication. It preserves each source capture hash, system run, original
rank, raw-result hash, latency, failure, and content-license metadata.

## Blind review

`benchmarks/quality.mjs --prepare-reviewer-packet` accepts the pooled artifact.
It retains only the material needed for judgment and attribution: query,
question/reference answer, title, URL, snippet, and license metadata. It hides
system identity, original rank, engine outcomes, internal scores, source
counts, and execution traces. Each reviewer receives a deterministic
reviewer-specific permutation.

The original pending packet contains an explicit unfilled human reviewer
record. The automated path replaces it with audited AI metadata;
`reviewer_slot` is only a permutation key and is not accepted as an identity.

## Import and adjudication

The pool importer requires at least two completed same-mode packets. For AI
review, they must use different model families and retain fixed prompt and
per-verdict evidence hashes. Human packets remain supported. Every mode still
requires:

- distinct non-empty reviewer IDs;
- parseable completion timestamps;
- a judgment for every pooled candidate;
- unchanged candidate URLs and source-pool hash.

It retains both judgments and emits agreement/disagreement counts. A completed
adjudication passes validation only when every candidate has a final relevance
and citation-support judgment, all original reviewer judgments remain present,
and a matching-mode adjudicator ID and completion timestamp are recorded. AI
disagreements require a third model family and hashed adjudication evidence.

## Verification

The contract has unit coverage for deterministic pooling, URL deduplication,
input-order invariance, metadata/identity rejection, blind-packet provenance
removal, disagreement import, completed-adjudication validation, pointwise AI
review evidence, distinct-family enforcement, and third-family adjudication.

## Comparison report

A completed adjudication can be evaluated with:

```bash
node benchmarks/pool.mjs \
  --compare benchmarks/fixtures/search-pool.json \
  --adjudication benchmarks/reviews/search-pool.adjudication.completed.json \
  --output benchmarks/reports/search-pool.comparison.json
```

The evaluator verifies both evidence hashes and exact sample/candidate/rank
coverage, then reconstructs each system's original top five. It reports
nDCG@5, Precision@5, pool-relative Recall@5, reciprocal rank, Success@5,
citation support, latency, failure disclosure, and language/category/freshness
slices. It marks answer accuracy and tokens per correct answer unmeasured,
because no synthesized answer was independently judged.

The adjudication artifact also retains pre-adjudication reviewer reliability.
It records raw agreement, mean pairwise quadratic-weighted Cohen's kappa for
ordinal relevance, and mean pairwise Cohen's kappa for binary citation
support. The completed-artifact validator recomputes these values from the
retained judgments, so they cannot be edited independently. Undefined
no-variance pairs remain `null` and are counted separately.

Completed review and public-claim readiness are separate. Reports require
30 adjudicated rows and 30 distinct normalized queries before
`quality_claim_eligible` can become true; individual slices require 10 rows
and 10 distinct queries. At the overall floor, every system pair also receives
2,000 deterministic query-paired bootstrap resamples and a percentile 95%
confidence interval for left-minus-right retrieval and latency deltas. Below
the floor the pair remains `insufficient-sample`; all pairs must be reported
before headline eligibility. These thresholds and intervals prevent the
two-query qualification pilot from becoming a headline benchmark, but do not
replace statistical-power, practical-significance, or query-coverage analysis.

## Remaining external gate

1. Capture Agent Search and a genuinely independent comparison system against
   the same versioned query set.
2. Run two distinct AI model families over the blinded pointwise candidates.
3. Adjudicate disagreements with a third model family.
4. Publish the completed comparison only with its `ai-reviewed` and
   `ai-judged` scope visible.
