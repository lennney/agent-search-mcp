# Release candidate packed smoke — `a1de485`

## Candidate identity

- Source commit:
  `a1de48515d84748d8bf40e66d8853266e0dd1268`
- Artifact: `agent-search-mcp-3.2.0.tgz`
- Retained path:
  `C:\Users\LIU\.codex\release-artifacts\agent-search-mcp\a1de48515d84748d8bf40e66d8853266e0dd1268\agent-search-mcp-3.2.0.tgz`
- SHA-256:
  `002EBC7C7AC7E4B8330C1AB25288CD4DB71917ECBC4C2A5C7CB76BE08BFABAEA`
- npm pack: 77 files, 106,180 bytes packed, 385,303 bytes unpacked.

The source came from a clean `git archive` of the commit. A fresh `npm ci`,
Windows build, and one `npm pack --ignore-scripts` produced the retained
tarball. Its directory contains one artifact. Tar inspection confirmed version
3.2.0, Node.js >=18.17, the 16-adapter build, and the corrected package
changelog.

## Dependency correction

The lock file and every smoke cell resolve `@hono/node-server` 1.19.15 through
MCP SDK 1.29.0. Hono's official
[GHSA-frvp-7c67-39w9 advisory](https://github.com/honojs/node-server/security/advisories/GHSA-frvp-7c67-39w9)
lists 1.19.15 as the patched 1.x release. Its package metadata supports Node.js
>=18.14.1, so the correction does not weaken this package's Node 18.17 runtime
contract.

## Cross-platform matrix

Every cell installed the same retained tarball with lifecycle scripts disabled,
resolved Hono 1.19.15, ran `fasm doctor --json`, completed MCP `initialize` and
`tools/list` over stdio, required server version 3.2.0, found all 8 tools and
16 Provider entries, and terminated. No search or extraction tool was called.

| Platform | Node | Hono Node Server | Install | Doctor | Launcher | stdio | Tools |
|---|---:|---:|---|---|---|---|---:|
| Windows | 18.20.8 | 1.19.15 | pass | pass | `fasm.cmd` pass | pass | 8 |
| Windows | 20.20.2 | 1.19.15 | pass | pass | `fasm.cmd` pass | pass | 8 |
| Windows | 22.23.1 | 1.19.15 | pass | pass | `fasm.cmd` pass | pass | 8 |
| Linux x64 (WSL2 Ubuntu) | 18.20.8 | 1.19.15 | pass | pass | `fasm` pass | pass | 8 |
| Linux x64 (WSL2 Ubuntu) | 20.20.2 | 1.19.15 | pass | pass | `fasm` pass | pass | 8 |
| Linux x64 (WSL2 Ubuntu) | 22.23.1 | 1.19.15 | pass | pass | `fasm` pass | pass | 8 |

The installs still emit npm's deprecation notice for
`whatwg-encoding@3.1.1`, reached through the Node-18-compatible
`cheerio@1.0.0` → `encoding-sniffer@0.2.1` chain. The compatible replacement
requires Node 20, so it is not forced into this release. No cell emitted
`EBADENGINE`. WSL verifies Linux x64 binaries and process behavior in a user
environment; it is not a hosted or independent runner.

## Limited Live E2E

The current candidate did not call a live Provider. The release retains the
single bounded DDG stdio observation from
`73c34969bbb92d5f9c70ab7ffedf02c5be5d2f2f`: one request, one DDG adapter
attempt, no automatic retry, and a non-empty structured result.

The dependency and changelog corrections do not change the DDG/Sogou request
chains. The retained observation remains a point-in-time regression check, not
an availability, latency, or accuracy measurement.

## npm audit metadata mismatch

`npm audit --omit=dev` still exits 1 with two moderate findings because its
registry payload describes the affected range as `<2.0.5`. That range omits the
official 1.19.15 backport. The release records both facts instead of
downgrading MCP SDK or forcing the Node 20-only Hono 2.x line. Agent Search MCP
also does not register the affected `serve-static` handler.
