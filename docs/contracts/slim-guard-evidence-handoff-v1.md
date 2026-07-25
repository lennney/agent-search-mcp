# Slim Guard evidence handoff v1

Status: optional integration contract
Producer: Agent Search MCP
Consumer: Slim Guard or another policy/compression middleware

Agent Search remains installable and runnable without Slim Guard. This contract
describes the JSON response that middleware may accept; it does not add a
runtime dependency or change an MCP tool signature.

## Required invariants

- Every result retains `title`, `url`, and at least one entry in `sources`.
- Full results keep `confidence`, `relevance`, `source_count`, and `evidence`
  as separate signals.
- `source_count` equals the number of unique sources. Extraction quality or
  passage score must never increase corroboration.
- A compact result may omit passage text and scores, but not source provenance.
- `partialFailures` remains response-level evidence and must survive a
  transformation.
- `meta.evidence_budget` describes passage characters, not total JSON bytes or
  tokens.
- Missing publication time remains `null`; middleware must not infer a date.

Middleware may sanitize, redact, reorder under an explicit policy, shorten
passages, or compact results. If it does so, it should append its own transform
metadata rather than overwriting Agent Search evidence.

The machine-readable input contract is
[`slim-guard-evidence-handoff-v1.schema.json`](./slim-guard-evidence-handoff-v1.schema.json).
The benchmark validator in `benchmarks/lib/evidence-handoff.mjs` checks the
cross-field invariants that JSON Schema cannot express concisely.
