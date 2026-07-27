# MCP 2026-07-28 experimental entry

This private package is the isolated Node.js 20+ compatibility track for
Agent Search. It pins the split TypeScript SDK v2 packages to
`2.0.0-beta.5` and explicitly serves MCP `2026-07-28`, with a
`2025-11-25` legacy fallback.

It is not published, is not the production default, and does not change the
root package's Node.js 18+ or SDK v1 contract.

## Boundary

The entry imports the root build's `searchWithFallback` function. Only
JSON-shaped search arguments and results cross that boundary; SDK clients,
servers, transports, sessions, and errors do not.

## Build and test

Run these commands from the repository root:

```bash
npm install
npm --prefix experiments/mcp-2026 install
npm run experimental:2026:build
npm run experimental:2026:test
```

The tests pin an SDK v2 client to `2026-07-28`, verify legacy fallback,
exercise routing-header mismatch rejection, and connect through real HTTP and
stdio transports. The real HTTP tests cover case-insensitive
`Mcp-Param-*` names, integer canonicalization, missing and malformed parameter
headers, and duplicate routing fields. They also start the production SDK v1
entrypoints and prove that an SDK v2 client in `auto` mode falls back over both
HTTP and stdio. The P2 HTTP matrix additionally covers CORS and Origin
enforcement, Bearer authentication, W3C trace propagation, real-socket
cancellation, cache hints, and automatic `tools/list_changed` refresh.

Capture a redacted, reproducible HTTP evidence record:

```bash
npm --prefix experiments/mcp-2026 run evidence:p2 -- --captured-on=2026-07-26
```

The checked-in capture records the local runtime and exact SDK pins. CI Node
20/22 values are labelled as configured targets, not local executions. See
[`docs/evidence/mcp-2026-p2-http-matrix.md`](../../docs/evidence/mcp-2026-p2-http-matrix.md).

## Run

HTTP is secure by default:

```bash
HTTP_AUTH_TOKEN=replace-me npm run experimental:2026:http
```

The default endpoint is `http://127.0.0.1:3100/mcp`. For a non-loopback
`HOST`, set `ALLOWED_HOSTS`; browser origins must be listed in
`ALLOWED_ORIGINS`. `HTTP_ALLOW_UNAUTHENTICATED=true` is intended only for a
trusted local test. POST requests must declare `Content-Length`; chunked
request bodies are rejected so `HTTP_MAX_BODY_BYTES` cannot be bypassed.
Duplicate `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`, or
`Mcp-Param-*` fields are rejected before Node normalizes them into one value.

For stdio:

```bash
npm run experimental:2026:stdio
```

## Conformance status

As of 2026-07-25, npm package
`@modelcontextprotocol/conformance@0.1.16` lists protocol scenarios only
through `2025-11-25`. Its `server-initialize` scenario passes against this
entry, which is useful legacy-regression evidence but is not complete
`2026-07-28` conformance evidence. Modern negotiation is covered by the pinned
SDK v2 tests until the official suite publishes 2026 scenarios.

`npm audit --omit=dev` currently reports the SDK Node adapter's transitive
`@hono/node-server@1.19.15` because of a Windows `serve-static` advisory.
This entry does not register or call static-file serving. Do not force a major
transitive override; replace the pin when the SDK publishes a compatible
patched dependency.
