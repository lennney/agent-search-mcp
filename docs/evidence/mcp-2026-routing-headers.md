# MCP 2026 routing-header evidence

Date: 2026-07-26

## Scope

This evidence closes the roadmap item for `Mcp-Param-*` canonicalization and
duplicate routing-header handling in the private Node.js 20+ experimental
entry. It does not claim final MCP `2026-07-28` conformance.

Pinned components:

- `@modelcontextprotocol/server`: `2.0.0-beta.5`
- `@modelcontextprotocol/node`: `2.0.0-beta.5`
- `@modelcontextprotocol/client`: `2.0.0-beta.5`
- Node.js requirement: 20+

## Boundary

The SDK validates schema-declared `x-mcp-header` parameters against the
JSON-RPC body. Agent Search adds one edge rule before the Node adapter converts
the request to Web `Headers`: duplicated routing fields are rejected by
examining `IncomingMessage.rawHeaders`.

The duplicate rule covers:

- `MCP-Protocol-Version`
- `Mcp-Method`
- `Mcp-Name`
- every case-insensitive `Mcp-Param-*` field

It does not reject ordinary repeated HTTP fields that are unrelated to MCP
routing.

## Reproducible cases

The real-socket tests register a private `routed_echo` test tool whose integer
`limit` property declares `x-mcp-header: Limit`.

| Case | Expected result |
|---|---|
| Mixed-case `mCp-PaRaM-LiMiT: 5.0`, body `limit: 5` | HTTP 200; numeric canonicalization succeeds |
| Body `limit: 5`, parameter header absent | HTTP 400; JSON-RPC `-32020` |
| Non-canonical Base64 sentinel | HTTP 400; JSON-RPC `-32020` |
| Duplicate `Mcp-Method` fields | HTTP 400 / `-32020` before SDK normalization |
| Duplicate `Mcp-Param-Limit` fields | HTTP 400 / `-32020` before SDK normalization |

Run:

```bash
npm --prefix experiments/mcp-2026 run build
npm --prefix experiments/mcp-2026 exec vitest run tests/http.test.ts
```

Full experimental gate:

```bash
npm run experimental:2026:test
```

## Remaining gates

- Official HTTP and stdio scenarios for the final 2026 protocol
- CORS preflight and Origin rejection matrix
- Bearer authentication failure/success matrix
- W3C trace propagation
- cache-hint and tool-list-change behavior
- cancellation over a real socket
- versioned raw traces with Node and SDK versions
