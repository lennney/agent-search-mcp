# P2 search-quality pilot evidence

Date: 2026-07-26

Status note: this document records the original human-gated pilot. The current
default is the auditable AI path documented in
[`2026-07-26-search-pooling-contract.md`](./2026-07-26-search-pooling-contract.md):
two different model families judge blinded candidates and a third family
resolves only disagreements. The pending-human fixtures remain as historical
and compatibility artifacts.

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
- Current automated evidence uses `ai-reviewed` / `ai-judged`, two distinct
  judge model families, a third-family disagreement adjudicator, retained
  verdict evidence, completion timestamps, and a non-empty pooled capture.
  Legacy `human-verified` review remains optional.

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
does not turn that fixture into completed review evidence.

## Current remaining gate

1. Capture a non-empty pooled run on a stable network runner.
2. Hide engine identity during review.
3. Run two different AI model families over every blinded candidate.
4. Use a third model family only for disagreements and retain its evidence.
5. Validate the final `ai-reviewed` artifact and disclose the `ai-judged`
   claim scope.

Until this gate closes, the roadmap's adjudicated dataset item remains open.
