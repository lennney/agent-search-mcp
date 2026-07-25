# MCP 2026 P2 fallback evidence

Date: 2026-07-25

## Scope

Verify that an SDK v2 beta.5 client configured with
`versionNegotiation.mode = "auto"` can probe the production SDK v1 server and
fall back to MCP `2025-11-25` without changing the stable tool contract.

Both tests start the real compiled production entrypoint:

- stdio: the SDK uses a disposable sibling for `server/discover`, then starts a
  fresh process for the legacy handshake.
- HTTP: the same endpoint returns a method-not-found legacy signal for
  `server/discover`, then completes `initialize`,
  `notifications/initialized`, and `tools/list`.

## Failure found and fixed

The first HTTP run exposed two independent defects:

1. Forwarding `server/discover` into the SDK v1 transport returned an
   unsupported-version response and left fallback behavior dependent on v1
   adapter internals.
2. The production server reused a stateless SDK v1 transport across HTTP
   requests. SDK v1.29 rejects this explicitly; the second request returned
   HTTP 500.

The stable HTTP entry now:

- handles the modern discovery probe before the SDK v1 transport;
- creates a fully registered MCP server and Web Standard stateless transport
  for every MCP HTTP request;
- uses a local Node/Web bridge, avoiding the Hono wrapper's empty-500 behavior
  for `202 Accepted` notifications.

## Reproducible checks

```bash
npm run build
npm run experimental:2026:test
```

Expected result:

- stable suite: 515 tests across 44 files;
- experimental suite: 11 tests across 4 files;
- fallback result over HTTP and stdio: era `legacy`, negotiated version
  `2025-11-25`, `free_search` visible.

The CI workflow runs the experimental suite independently on Node.js 20 and
22. The fallback tests also passed locally through npm-distributed Node 20 and
Node 22 runtimes. CI results are not treated as passed until the remote jobs
complete after push.

## Locked versions

- stable SDK: `@modelcontextprotocol/sdk@1.29.0`
- experimental SDK: split v2 packages `2.0.0-beta.5`
- full local suites: Node.js `24.14.1`, npm `11.6.2`
- local fallback compatibility probes: Node.js 20 and 22

## Remaining release gates

- official `2026-07-28` conformance scenarios are not yet published in the npm
  conformance package;
- `Mcp-Param-*`, cancellation, cache invalidation, trace propagation, and
  tool-list change scenarios remain pending.
