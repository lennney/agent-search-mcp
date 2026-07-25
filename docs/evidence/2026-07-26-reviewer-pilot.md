# Non-empty reviewer-pipeline pilot

Date: 2026-07-26

## Outcome

The search-quality pipeline now has a real non-empty qualification capture and
two independent blinded reviewer packets:

- 2 bilingual factual queries.
- 10 returned candidates per query.
- 1 real Wikipedia request per query.
- Questions and reference answers preserved separately from search keywords.
- Search-adapter and ranking provenance, internal confidence/relevance, source
  counts, and execution traces removed from reviewer-facing packets. Publisher
  URLs and required content-license attribution remain visible.
- Original rank replaced by opaque candidate IDs and a deterministic
  reviewer-specific permutation.

This proves the capture-to-reviewer workflow. It is deliberately not presented
as a search-quality result: the current artifact uses one engine, is not a
multi-system candidate pool, and contains no human judgments.

## Core defects fixed while qualifying the pipeline

1. Waterfall search previously ignored an explicit `engines` list and could
   call unrelated adapters. It now filters every phase and optional paid
   fallback to the requested set.
2. Wikipedia OpenSearch often returned empty descriptions, which were then
   removed by the low-quality filter. The adapter now uses MediaWiki search
   plus bounded article extracts and routes CJK queries to Chinese Wikipedia.
3. Relevance scoring previously gave any title/body token match the same
   bucket score. It now uses Latin/CJK query-term coverage, so broader lexical
   matches rank above one-term partial matches while confidence remains a
   separate source-reliability signal.

## Reproduction

```bash
npm run benchmark:reviewer-pilot:capture
npm run benchmark:reviewer-pilot:prepare
npm run benchmark:reviewer-pilot:verify
```

Artifacts:

- `benchmarks/queries/reviewer-pilot.json`
- `benchmarks/fixtures/live-reviewer-pilot.json`
- `benchmarks/fixtures/live-reviewer-pilot-labels.pending.json`
- `benchmarks/reviews/live-reviewer-pilot.reviewer-a.pending.json`
- `benchmarks/reviews/live-reviewer-pilot.reviewer-b.pending.json`
- `benchmarks/DATA_LICENSES.md`

Wikipedia extracts are separately identified as CC BY-SA 4.0 content with
article-URL attribution and a truncation notice. They are not silently treated
as Apache-licensed project code.

## Remaining quality gate

1. Add outputs from at least one independent search system to the candidate
   pool and deduplicate by canonical URL.
2. Have two people independently complete the blinded packets.
3. Adjudicate disagreements while retaining both original reviews.
4. Validate the final fixture with `--require-human`.
5. Only then publish nDCG/MRR/citation support. Recall remains unavailable
   until the multi-system pool is complete.
