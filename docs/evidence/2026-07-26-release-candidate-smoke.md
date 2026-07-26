# Release candidate packed smoke — 2026-07-26

## Candidate identity

- Git commit: `3f170675837e6d98ed4dc80a9e745277efe30044`
- Artifact: `agent-search-mcp-3.2.0.tgz`
- Retained path:
  `C:\Users\LIU\.codex\release-artifacts\agent-search-mcp\3f170675837e6d98ed4dc80a9e745277efe30044\agent-search-mcp-3.2.0.tgz`
- SHA-256: `4F849C96CD405C62E8DF4EA957B40154C1A8E7024778672324CC108E8FC87C56`
- npm pack: 72 files, 101,030 bytes packed, 361,419 bytes unpacked

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

No live provider was probed for the final candidate. The release gate retains
the single bounded stdio search smoke previously captured from commit
`73c34969bbb92d5f9c70ab7ffedf02c5be5d2f2f`: it used
`LIVE_E2E_MAX_REQUESTS=1`, one DDG adapter-attempt budget, no automatic retry,
and no paid provider. MCP initialize, tools/list, structured output, and a
non-empty search result set passed in about 5.4 seconds; extract was skipped by
the one-request limit.

`git diff --name-only 73c34969..3f170675` contains no `src/**` change. The
intervening executable change is limited to the opt-in live-E2E harness and
tests; the remaining changes are package/Registry metadata, documentation, and
archive cleanup. The retained result is therefore used only as a bounded
no-regression observation. DDG and Sogou were not called again.

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
