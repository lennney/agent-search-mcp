# P2 search-quality pilot evidence

Date: 2026-07-26

## What is implemented

- Live capture stores the untouched search response, SHA-256 response hash,
  latency, and an explicit outcome for every requested engine.
- `benchmarks/quality.mjs --prepare-capture` turns a traced capture into a
  pending human-label template without inventing labels.
- Evaluated fixtures use 0-3 graded relevance and report answer accuracy,
  nDCG@5, Precision@5, reciprocal rank@5, Success@5, citation support, tokens
  per correct answer, latency, raw-trace coverage, and failure disclosure as
  separate dimensions.
- Reports include language, category, and freshness slices.
- `bootstrap` fixtures test metric regressions but set
  `quality_claim_eligible: false`.
- Public quality claims require `human-verified`, two distinct human reviewers,
  retained independent judgments, completed adjudication, a verification
  timestamp, and at least one returned result in the pooled capture.

## Real network pilot

`benchmarks/fixtures/live-p2-pilot.json` contains two real production-run
queries captured on this runner: one English dynamic-news query and one Chinese
technical query.

Both returned zero results after eight zero-key engine calls. The trace records
upstream timeouts, HTTP 403 responses, zero-result successes, skipped paid
adapters, and the response-level disclosed failures. This is useful
failure-transparency evidence, not positive search-quality evidence.

The corresponding
`benchmarks/fixtures/live-p2-pilot-labels.pending.json` is intentionally
`pending-human`. It cannot pass the quality evaluator until people complete the
labels and review metadata.

## Reproduction

```bash
npm run build
node benchmarks/run.mjs \
  --capture benchmarks/fixtures/live-p2-pilot.json \
  --limit 2

node benchmarks/quality.mjs \
  --prepare-capture benchmarks/fixtures/live-p2-pilot.json \
  --output benchmarks/fixtures/live-p2-pilot-labels.pending.json

npm run benchmark:quality:verify
```

`benchmark:quality:verify` checks only the deterministic bootstrap fixture. It
does not turn that fixture into human evidence.

## Remaining human gate

1. Capture a non-empty pooled run on a stable network runner.
2. Hide engine identity during review.
3. Have two people independently judge every returned URL.
4. Adjudicate disagreements and retain reviewer metadata.
5. Change the final fixture to `human-verified` and run with
   `--require-human`.

Until this gate closes, the roadmap's human-labeled dataset item remains open.
