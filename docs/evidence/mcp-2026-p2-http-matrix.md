# MCP 2026 P2 HTTP behavior matrix

Captured: 2026-07-26

This package verifies the remaining stateful and security-sensitive behavior
around the isolated MCP `2026-07-28` entry. It does not promote that entry or
replace the official conformance release gate.

## Verified behavior

| Behavior | Boundary | Evidence |
|---|---|---|
| Trusted CORS preflight | Real Node HTTP socket | `204`, exact Origin reflection, routing and W3C trace headers allowed |
| Untrusted Origin | Real Node HTTP socket | Preflight and POST return `403` without Origin reflection |
| Bearer authentication | Real Node HTTP socket and SDK client | Missing/wrong credentials return `401`; scheme matching is case-insensitive |
| Trace propagation | Real Node HTTP socket | `traceparent`, `tracestate`, and `baggage` reach the search execution boundary |
| Cancellation | Real Node HTTP socket and SDK client | Client abort reaches the server-side search `AbortSignal` |
| Tool-list cache hints | SDK v2 client/server | `tools/list` advertises public 300-second caching and the second read is local |
| Tool-list changes | SDK v2 subscription | `tools/list_changed` invalidates the client cache and triggers one refresh |

Trace headers are untrusted request metadata. The experimental boundary passes
them to the search execution context but does not log them; in particular,
`baggage` must not be treated as a safe place for secrets.

## Reproduction

From `experiments/mcp-2026`:

```bash
npm test
npm run evidence:p2 -- --captured-on=2026-07-26
```

The checked-in capture is
[`experiments/mcp-2026/evidence/p2-http-matrix-2026-07-26.json`](../../experiments/mcp-2026/evidence/p2-http-matrix-2026-07-26.json).
Authorization values are replaced with `[REDACTED]`. To keep diffs
reproducible, the capture records exact security/protocol response headers and
explicitly lists omitted volatile transport headers.

## Versions and scope

- Local capture runtime: Node.js `v24.14.1`, Windows x64.
- Pinned SDK packages: server/client/node adapter `2.0.0-beta.5`.
- Repository CI configuration targets Node.js 20 and 22 for the isolated
  experiment. Those are configuration facts, not a claim that this local
  capture ran on both versions.
- Protocol: `2026-07-28`, with `2025-11-25` legacy fallback.

The official 2026 HTTP and stdio conformance scenarios, final SDK replacement,
and promotion decision remain open release gates.
