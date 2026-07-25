---
title: "MCP ecosystem and 2026-07-28 readiness plan"
status: active
date: 2026-07-25
target: 2026-07-28
---

# Outcome

Build a local-first MCP ecosystem in which:

- Agent Search is the zero-key, Chinese-native search and retrieval entrypoint.
- Slim Guard is the tools policy gateway and context-efficiency middleware.
- A public benchmark measures search quality and middleware correctness as two
  separate tracks.
- MCP `2025-11-25` remains the production default until the experimental
  `2026-07-28` path passes the official conformance suite.

# Protocol strategy

Complete `2026-07-28` wire support requires the official TypeScript SDK v2 and
Node.js 20+. The current package supports Node.js 18+ and uses SDK v1.
Migration is therefore deliberately dual-track.

| Surface | Stable track | Experimental 2026 track |
|---|---|---|
| Runtime | Node 18/20/22 | Node 20+ |
| SDK | `@modelcontextprotocol/sdk` v1 | split v2 packages, beta.5 pinned |
| Negotiation | legacy `initialize` | explicit `2026-07-28` discovery |
| HTTP | current Streamable HTTP | stateless, secure-by-default |
| stdio | production default | dual-era experimental entry |
| Release status | production default | explicit opt-in until gates pass |

# Work packages

## P0A - Agent Search core evidence semantics

Scope: Agent Search only. Slim Guard is not changed in this package.

- [x] Preserve explicit per-engine outcomes and expose thrown upstream failures
      through `partialFailures` without stopping fallback.
- [x] Carry request cancellation through orchestration, waits, retries, engine
      calls, and enrichment.
- [x] Keep enrichment confidence-neutral; extraction quality is not independent
      source corroboration.
- [x] Share one cache-key contract across parallel and waterfall execution and
      read the cache in both modes.

## P1A - query-aware evidence packets

Scope: Agent Search only. This defines the future Slim Guard handoff shape
without adding a runtime dependency on the gateway.

- [x] Select evidence passages deterministically from the original query.
- [x] Enforce a shared response-level character budget and report its use.
- [x] Keep provenance, relevance, corroboration, freshness, and extraction
      metadata as separate inspectable signals.
- [x] Preserve sources on compact placeholders and engine failures at the
      response boundary.
- [x] Replay fixed 1200/600/360-character scenarios with the locked tokenizer.

Evidence: [`docs/evidence/2026-07-26-evidence-packets.md`](../evidence/2026-07-26-evidence-packets.md).

## P2B - measurable search and optional middleware contract

- [x] Preserve raw response hashes, per-engine outcomes, latency, and failures
      in live benchmark captures.
- [x] Add independent retrieval, citation, token-efficiency, latency, and
      failure-transparency metrics with language/category/freshness slices.
- [x] Prevent bootstrap fixtures from becoming public quality claims.
- [x] Define and test an optional Slim Guard evidence handoff without adding a
      runtime dependency.
- [ ] Complete two-reviewer human judgments on a non-empty pooled capture.

Evidence: [`docs/evidence/2026-07-26-p2-quality-pilot.md`](../evidence/2026-07-26-p2-quality-pilot.md).

Reviewer-pipeline qualification:
[`docs/evidence/2026-07-26-reviewer-pilot.md`](../evidence/2026-07-26-reviewer-pilot.md).
The non-empty single-engine capture and two blinded packets are ready; a
multi-system pool, two actual human judgments, and adjudication remain open.

## P0 - credibility and compatibility

- [x] Correct `search_with_synthesis` confidence semantics: confidence is 0-1,
      while independent corroboration is `min_source_count`.
- [x] Preserve legacy values 2-3 as source-count aliases.
- [x] Preserve per-result source provenance in synthesis output.
- [x] Publish stable and target protocol status on `/health`.
- [x] Allow the 2026 routing and W3C trace headers through browser CORS.
- [x] Run the full test suite and build on the current stable track.

## P1 - isolated SDK v2 prototype

- [x] Create `experiments/mcp-2026`, a private Node.js 20+ entrypoint with an
      independent lockfile and exact SDK v2 beta.5 versions.
- [x] Share only JSON-shaped search-domain arguments/results; never pass SDK v1
      clients, servers, transports, sessions, or errors across the boundary.
- [x] Opt in to `2026-07-28` explicitly and retain a `2025-11-25` fallback.
- [x] Exercise SDK `server/discover` through a client pinned to `2026-07-28`.
- [x] Verify real HTTP and stdio negotiation.
- [x] Verify protocol-version routing and reject `Mcp-Method`/`Mcp-Name`
      headers that disagree with the JSON-RPC body.
- [x] Keep the entry stateless and all search state in bounded tool arguments.
- [x] Generate a bounded, self-contained tool schema without external `$ref`
      dereferencing.
- [x] Preserve `structuredContent`; let the SDK emit standard protocol errors
      while tool execution failures retain `isError`.
- [x] Require Bearer auth by default, validate Host/Origin, and keep `/health`
      public for probes.
- [x] Enforce the HTTP byte limit for all accepted POST bodies by requiring a
      valid `Content-Length` and rejecting chunked transfer encoding.

Evidence on 2026-07-25:

- SDK v2 tests: 9 passed across 3 files.
- Modern and legacy negotiation pass through the same factory.
- Official conformance `0.1.16` `server-initialize`: 1/1 passed against the
  experimental HTTP server.
- Limitation: conformance `0.1.16` only advertises scenarios through
  `2025-11-25`; this is legacy-regression evidence, not complete 2026
  conformance.

## P2 - conformance and release gates

- [ ] Run official 2026 conformance for HTTP and stdio when those scenarios are
      published.
- [x] Test automatic fallback from a 2026-capable client to the stable server
      over real HTTP and stdio entrypoints.
- [x] Run the experimental compatibility suite as isolated Node 20/22 CI jobs.
- [x] Record the first fallback trace, versions, root cause, and reproduction
      commands in `docs/evidence/mcp-2026-p2-fallback.md`.
- [x] Expand routing checks to `Mcp-Param-*` canonicalization and duplicates.
- [x] Test CORS preflight, Origin validation, Bearer auth, trace propagation,
      caching hints, cancellation, and tool-list changes.
- [x] Record raw traces, SDK versions, the local Node version, configured CI
      Node targets, and failure cases without representing configured targets
      as local executions.
- [ ] Promote the 2026 path only when all required conformance scenarios pass
      and the final specification/SDK release is available.

Routing-header evidence:
[`docs/evidence/mcp-2026-routing-headers.md`](../evidence/mcp-2026-routing-headers.md).

HTTP behavior evidence:
[`docs/evidence/mcp-2026-p2-http-matrix.md`](../evidence/mcp-2026-p2-http-matrix.md).

## P3 - Slim Guard integration

- [ ] Fix Slim Guard protocol fidelity before using it as the public gateway:
      preserve `isError`, `structuredContent`, `_meta`, media, and resource
      links.
- [ ] Add remote HTTP upstream support and explicit stable routing names.
- [ ] Isolate cache entries by tenant/session and never cache mutations.
- [ ] Redact secrets from audit records.
- [ ] Define typed hooks for tool-list transformation, authorization,
      tool-result transformation, and audit.
- [ ] Ship an optional `agent-search` preset; keep direct Agent Search install
      working without Slim Guard.

## P4 - benchmark

- [ ] Search track: nDCG@10, recall/MRR, passage recall, grounded-answer
      accuracy, citation support, tokens per correct answer, p50/p95 latency.
- [ ] Middleware track: full-episode tokens, task success, semantic protocol
      preservation, security false positives/negatives, cache isolation.
- [ ] Publish separate leaderboards; do not hide quality regressions in a
      combined score.
- [ ] Version datasets and publish raw traces plus known failure cases.

# 2026 release-day checklist

1. Compare the final `2026-07-28` changelog with the locked RC.
2. Replace beta pins with verified final SDK v2 versions.
3. Re-run conformance and the complete benchmark.
4. Update protocol status only from verified evidence.
5. Keep the stable entrypoint available for at least one migration window.

# Plan synchronization

The repository plan and ADRs are authoritative. Hermes projection is deferred
for now; no remote state is required for P1.

# Primary references

- MCP 2026-07-28 RC overview:
  https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/
- TypeScript SDK v1-to-v2 migration:
  https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2
- TypeScript SDK 2026 protocol support:
  https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28
- Official conformance suite:
  https://github.com/modelcontextprotocol/conformance
