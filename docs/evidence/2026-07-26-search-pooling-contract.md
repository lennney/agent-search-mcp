# Multi-system search review pooling contract

Date: 2026-07-26

## Outcome

Agent Search now has an executable, deterministic contract for creating a
candidate pool from two or more search-system captures and carrying that pool
through blinded independent review and human adjudication.

This is workflow evidence, not search-quality evidence. No independent
comparison-system capture or human judgment was created as part of this
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

The pending packet contains an explicit unfilled human reviewer record.
`reviewer_slot` is not accepted as evidence of a person.

## Import and adjudication

The pool importer requires at least two completed packets with:

- distinct non-empty human reviewer IDs;
- parseable completion timestamps;
- a judgment for every pooled candidate;
- unchanged candidate URLs and source-pool hash.

It retains both judgments and emits agreement/disagreement counts. A completed
adjudication passes validation only when every candidate has a final relevance
and citation-support judgment, all original reviewer judgments remain present,
and a human adjudicator ID and completion timestamp are recorded.

## Verification

The contract has unit coverage for deterministic pooling, URL deduplication,
input-order invariance, metadata/identity rejection, blind-packet provenance
removal, disagreement import, and completed-adjudication validation.

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

Human verification and public-claim readiness are separate. Reports require
30 adjudicated rows and 30 distinct normalized queries before
`quality_claim_eligible` can become true; individual slices require 10 rows
and 10 distinct queries. These thresholds prevent the
two-query qualification pilot from becoming a headline benchmark, but do not
replace statistical-power or query-coverage analysis.

## Remaining external gate

1. Capture Agent Search and a genuinely independent comparison system against
   the same versioned query set.
2. Obtain two independent human reviews.
3. Adjudicate disagreements.
4. Convert the completed adjudication into a `human-verified` quality fixture
   before reporting Recall or comparative quality.
