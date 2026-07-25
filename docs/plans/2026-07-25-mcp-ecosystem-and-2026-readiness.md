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

The official TypeScript SDK v2 is required for complete `2026-07-28` wire
support and requires Node.js 20+. The current package supports Node.js 18+ and
uses SDK v1. Therefore the migration is deliberately dual-track.

| Surface | Stable track | Experimental 2026 track |
|---|---|---|
| Runtime | Node 18/20/22 | Node 20/22 |
| SDK | `@modelcontextprotocol/sdk` v1 | split v2 packages |
| Negotiation | `initialize` | `server/discover` + per-request metadata |
| HTTP | current Streamable HTTP | stateless, no protocol session |
| Release status | production default | explicit opt-in until gates pass |

# Work packages

## P0 — credibility and compatibility

- [x] Correct `search_with_synthesis` confidence semantics: confidence is 0-1,
      while independent corroboration is `min_source_count`.
- [x] Preserve legacy values 2-3 as source-count aliases.
- [x] Preserve per-result source provenance in synthesis output.
- [x] Publish stable and target protocol status on `/health`.
- [x] Allow the 2026 routing and W3C trace headers through browser CORS.
- [x] Run the full test suite and build on the current stable track.

## P1 — isolated SDK v2 prototype

- [ ] Create an experimental Node 20+ entrypoint that shares search-domain
      functions but does not pass SDK v1 objects across the v1/v2 boundary.
- [ ] Opt in to `2026-07-28` serving explicitly; do not rely on SDK defaults.
- [ ] Implement and test `server/discover`.
- [ ] Verify `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`, and
      `Mcp-Param-*` header/body consistency.
- [ ] Keep application state in explicit tool arguments/handles.
- [ ] Add bounded JSON Schema 2020-12 validation and reject external `$ref`
      dereferencing.
- [ ] Preserve structured tool results and standard JSON-RPC error codes.

## P2 — conformance and release gates

- [ ] Run the official MCP conformance suite for HTTP and stdio.
- [ ] Test automatic fallback from a 2026-capable client to the stable server.
- [ ] Test CORS preflight, Origin validation, Bearer auth, trace propagation,
      caching hints, cancellation, and tool-list changes.
- [ ] Record raw traces, SDK versions, Node versions, and failure cases.
- [ ] Promote the 2026 path only when all required conformance scenarios pass
      and the final specification/SDK release is available.

## P3 — Slim Guard integration

- [ ] Fix Slim Guard protocol fidelity before using it as the public gateway:
      preserve `isError`, `structuredContent`, `_meta`, media, and resource links.
- [ ] Add remote HTTP upstream support and explicit stable routing names.
- [ ] Isolate cache entries by tenant/session and never cache mutations.
- [ ] Redact secrets from audit records.
- [ ] Define typed hooks for tool-list transformation, authorization,
      tool-result transformation, and audit.
- [ ] Ship an optional `agent-search` preset; keep direct Agent Search install
      working without Slim Guard.

## P4 — benchmark

- [ ] Search track: nDCG@10, recall/MRR, passage recall, grounded-answer
      accuracy, citation support, tokens per correct answer, p50/p95 latency.
- [ ] Middleware track: full-episode tokens, task success, semantic protocol
      preservation, security false positives/negatives, cache isolation.
- [ ] Publish separate leaderboards; do not hide quality regressions in a
      combined score.
- [ ] Version datasets and publish raw traces plus known failure cases.

# 2026 release-day checklist

1. Compare the final `2026-07-28` changelog with the locked RC.
2. Pin the final SDK v2 versions in the experimental build.
3. Re-run conformance and the complete benchmark.
4. Update protocol status only from verified evidence.
5. Keep the stable entrypoint available for at least one migration window.

# Plan synchronization

This file and repository ADRs are authoritative. Follow
`docs/decisions/ADR-20260725-plan-authority-and-hermes-projection.md` for the
Tencent Hermes projection. The remote projection must record the source commit
and must never be edited as an independent plan.

# Primary references

- MCP 2026-07-28 RC overview:
  https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/
- TypeScript SDK v1-to-v2 migration:
  https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2.html
- TypeScript SDK 2026 protocol support:
  https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28
- Official conformance suite:
  https://github.com/modelcontextprotocol/conformance
