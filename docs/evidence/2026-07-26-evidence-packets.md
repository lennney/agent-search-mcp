# Query-aware evidence packet evidence

Date: 2026-07-26
Scope: Agent Search only; Slim Guard was not modified.

## Contract

- Search results keep the existing `sources`, `confidence`, `relevance`, and
  `source_count` fields.
- Full results add an `evidence` object with deterministic passage overlap,
  matched query terms, upstream publication time when trustworthy, extraction
  provenance, and source/selected character counts.
- `EVIDENCE_BUDGET_CHARS` sets one shared passage budget per response. The
  response reports the limit, actual use, and truncated-result count in
  `meta.evidence_budget`.
- Compact placeholders retain `sources`, so progressive disclosure does not
  erase provenance.
- `partialFailures` stays at the response boundary. Evidence formatting does
  not hide failed engine calls.
- Prompt-injection scanning runs before passage selection. Suspicious selected
  passages carry a bounded warning and the existing structured security data.

No publication time is inferred. Missing or invalid upstream values are
returned as `published_at: null`.

## Reproducible checks

```bash
npm test
npm run build
npm run benchmark:verify
```

Frozen bilingual fixture replay:

| Scenario | Passage budget | Average tokens | Savings vs normal |
|---|---:|---:|---:|
| Normal | 1200 characters | 2311.0 | - |
| Compact | 600 characters | 1655.8 | 28.4% |
| Compact+ | 360 characters | 1607.5 | 30.4% |

The increase from the previous formatting schema is intentional: the output
now spends tokens on inspectable evidence metadata and source-preserving
compact placeholders. This replay is a formatting regression check, not a
search-quality ranking.
