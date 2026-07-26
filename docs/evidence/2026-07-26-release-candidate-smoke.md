# Release candidate packed smoke — 2026-07-26

## Candidate identity

- Git commit: `04a44ba5f5b5bf51e71d12428e4d2b2a25333963`
- Artifact: `agent-search-mcp-3.1.3.tgz`
- SHA-256: `B5BB3F8F2F3421535BF2E689E3C70F3DD8037FD60FB2C9B3F66C7150A2375784`
- npm pack: 72 files, 105.7 kB packed, 374.2 kB unpacked

The earlier `ff5dea0` artifact is rejected: its Pino 10 dependency selected
`thread-stream` 4, whose package metadata requires Node 20 and produced an
`EBADENGINE` warning on Node 18.

## Matrix

Each cell installed the exact tarball into an empty prefix, ran
`fasm doctor --json`, completed MCP `initialize` and `tools/list` over stdio,
verified `free_search` and `free_extract` discovery, and terminated the server.
No search or extraction tool was called.
The generated Windows `node_modules/.bin/fasm.cmd` was also executed under
Node 18.20.8 and returned a valid `doctor-report-v1`.

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

## Known audit exception

`npm audit --omit=dev` reports two moderate findings through MCP SDK 1.29.0's
`@hono/node-server` 1.x dependency. The advisory affects `serve-static`; Agent
Search MCP does not register a static-file handler. The latest MCP SDK remains
1.29.0 and still depends on the 1.x Hono adapter, so this candidate records the
non-reachable finding instead of forcing an unverified major transitive
override.
