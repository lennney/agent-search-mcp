# Release candidate packed smoke — 2026-07-26

## Candidate identity

- Git commit: `73c34969bbb92d5f9c70ab7ffedf02c5be5d2f2f`
- Artifact: `agent-search-mcp-3.2.0.tgz`
- SHA-256: `6206B15AD3D30BA45A7E74F4F8689EA88EF5AE6A2E05B355C7E8CD27326FCC26`
- npm pack: 72 files, 106.0 kB packed, 375.3 kB unpacked

Rejected candidates are retained only as failure evidence:

- `ff5dea0` selected Pino 10 / `thread-stream` 4, whose package metadata
  requires Node 20 and produced an `EBADENGINE` warning on Node 18.
- `9ba379d3` packaged version 3.2.0 but MCP initialize, HTTP health, and the
  capabilities resource still reported 3.1.3. The final candidate reads the
  package version through one shared implementation and has regression tests
  for initialize and health metadata.

## Matrix

Each cell installed the exact tarball into an empty prefix, ran
`fasm doctor --json`, completed MCP `initialize` and `tools/list` over stdio,
verified `free_search` and `free_extract` discovery, required server version
`3.2.0`, and terminated the server. No search or extraction tool was called.
The generated Windows `node_modules/.bin/fasm.cmd` was also executed under
Node 18.20.8 and returned a valid doctor report.

| Platform | Node | Install | Doctor | stdio | Tools |
|---|---:|---|---|---|---:|
| Windows | 18.20.8 | pass | pass | pass | 8 |
| Windows | 20.20.2 | pass | pass | pass | 8 |
| Windows | 22.23.1 | pass | pass | pass | 8 |
| Linux x64 (WSL2 Ubuntu) | 18.20.8 | pass | pass | pass | 8 |
| Linux x64 (WSL2 Ubuntu) | 20.20.2 | pass | pass | pass | 8 |
| Linux x64 (WSL2 Ubuntu) | 22.23.1 | pass | pass | pass | 8 |

Linux coverage used official Node Linux x64 distributions inside WSL2 Ubuntu.
It verifies Linux binaries and filesystem/process behavior, but is not an
independent hosted CI runner.

## Limited Live E2E

After explicit authorization to retry, the candidate ran a bounded stdio
search smoke with `LIVE_E2E_MAX_REQUESTS=1`, a single DDG adapter-attempt
budget, no automatic retry, and paid providers disabled. MCP initialize,
tools/list, structured output, and a non-empty search result set passed. The
search call completed in about 5.4 seconds; extract was skipped by the
one-request limit.

The npm 3.1.3 comparison returned an MCP search result in about 2.5 seconds,
but also exposed pre-existing release drift: its initialize metadata reported
3.1.1 and it lacked the current output schema and structured result channel.
No functional or contract regression was observed in 3.2.0. These isolated
requests are not sufficient for search accuracy, latency, or provider
availability claims.

## Known audit exception

`npm audit --omit=dev` reports two moderate findings through MCP SDK 1.29.0's
`@hono/node-server` 1.x dependency. The advisory affects `serve-static`; Agent
Search MCP does not register a static-file handler. The latest MCP SDK remains
1.29.0 and still depends on the 1.x Hono adapter, so this candidate records the
non-reachable finding instead of forcing an unverified major transitive
override.
