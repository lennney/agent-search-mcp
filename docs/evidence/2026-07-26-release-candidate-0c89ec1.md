# Release candidate packed smoke — `0c89ec1`

## Candidate identity

- Source commit:
  `0c89ec1438f8aecd3b9b21d47fe239964f0ec514`
- Artifact: `agent-search-mcp-3.2.0.tgz`
- Retained path:
  `C:\Users\LIU\.codex\release-artifacts\agent-search-mcp\0c89ec1438f8aecd3b9b21d47fe239964f0ec514\agent-search-mcp-3.2.0.tgz`
- SHA-256:
  `E5D1D7683A25BA9CAB32038A901F38A60F23127C858DB253432E762DAAC670EC`
- npm pack: 77 files, 106,095 bytes packed, 385,140 bytes unpacked.

The source came from a clean `git archive` of the commit. A fresh `npm ci`,
Windows build, and one `npm pack --ignore-scripts` produced the retained
tarball. Its directory contains one artifact. Tar inspection confirmed version
3.2.0, Node.js >=18.17, the four newly added adapters, and the optional semantic
bridge.

## Cross-platform matrix

Every cell installed the same retained tarball with lifecycle scripts disabled,
ran `fasm doctor --json`, completed MCP `initialize` and `tools/list` over
stdio, required server version 3.2.0, found all 8 tools and 16 Provider entries,
and terminated. No search or extraction tool was called.

| Platform | Node | Install | Doctor | Launcher | stdio | Tools |
|---|---:|---|---|---|---|---:|
| Windows | 18.20.8 | pass | pass | `fasm.cmd` pass | pass | 8 |
| Windows | 20.20.2 | pass | pass | `fasm.cmd` pass | pass | 8 |
| Windows | 22.23.1 | pass | pass | `fasm.cmd` pass | pass | 8 |
| Linux x64 (WSL2 Ubuntu) | 18.20.8 | pass | pass | `fasm` pass | pass | 8 |
| Linux x64 (WSL2 Ubuntu) | 20.20.2 | pass | pass | `fasm` pass | pass | 8 |
| Linux x64 (WSL2 Ubuntu) | 22.23.1 | pass | pass | `fasm` pass | pass | 8 |

The installs emitted npm's deprecation notice for
`whatwg-encoding@3.1.1`, reached through the Node-18-compatible
`cheerio@1.0.0` → `encoding-sniffer@0.2.1` chain. No cell emitted
`EBADENGINE`. WSL verifies Linux x64 binaries and process behavior in a user
environment; it is not a hosted or independent runner.

## Limited Live E2E

The current candidate did not call a live Provider. The release retains the
single bounded DDG stdio observation from
`73c34969bbb92d5f9c70ab7ffedf02c5be5d2f2f`: one request, one DDG adapter
attempt, no automatic retry, and a non-empty structured result.

Since that observation, the DDG Web/HTML/Lite adapters, shared HTTP transport,
and cancellation helper have not changed. The rate-limiter change only added
new Provider entries and kept DDG's interval unchanged. The search
orchestrator added adapters, while its explicit DDG dispatch remained intact.
The retained observation is therefore a point-in-time regression check, not an
availability, latency, or accuracy measurement. DDG and Sogou were not probed
again.

## Known audit exception

Current `npm audit --omit=dev` reports two moderate findings and no high or
critical findings through MCP SDK 1.29.0's `@hono/node-server` 1.x dependency.
The advisory affects its `serve-static` handler; Agent Search MCP does not
register a static-file handler. The release records this unreachable path
instead of forcing an unverified transitive major override.
