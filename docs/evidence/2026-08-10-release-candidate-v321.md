# Release candidate packed smoke — `de06804` (v3.2.1)

## Candidate identity

- Source commit:
  `de06804`
- Artifact: `agent-search-mcp-3.2.1.tgz`
- Retained path: outside the repository (local release artifact; path omitted)
- SHA-256: `ddba1c0424299d38aecf8f93c55c4562ae1990910c5066168322af623c22d69e`
- npm pack: 85 files, 124,290 bytes packed, 450,026 bytes unpacked.

The canonical tarball is rebuilt from a clean `git archive` of `de06804`
(`npm ci --ignore-scripts` + Windows build + `npm pack`), per the release gate
"从最终提交生成唯一 tarball".

## Changes since v3.2.0

- **fix**: Mojeek "empty results" were an undetected Altcha captcha served as
  HTTP 200; now surfaced as `bot_challenge`, joined the proxy-aware transport,
  and `fasm doctor` adds a `mojeek-proxy` check.
- **fix**: Startpage silently swallowed captcha pages; now detected as
  `bot_challenge`.
- **feat**: Shared transport hardening — per-attempt timeouts (hung proxies
  fail fast and rotate), proxy 407 as transport failure, bounded exit rotation
  on challenge/403/429, exponential backoff with jitter, per-exit passive
  health score.
- **feat**: Query-deterministic coherent browser request profiles (4 profiles),
  time-window rotation; applied to all zero-key HTML engines and the CSDN
  fetch tool.
- **feat**: Opt-in user-owned DDG/Sogou/Mojeek/Wiby proxy pools.
- **fix**: Word-boundary relevance matching (`cat` no longer matches `catalog`).
- **feat**: Agent Skill (`skills/agent-search/`) and the offline Evidence demo
  (`npm run demo:evidence`).
- **refactor**: Bilingual search request context, `SearchRuntime` ownership,
  provider catalog + runtime registry, half-open probe lease.
- **docs**: 2026-08-10 competitive-landscape update and README first-screen
  evidence comparison.
- No engines, tools, or MCP input signatures changed; compatibility-safe patch.

## Offline gates

- `npm run build`, `npm run lint` (0 warnings), `npm test`
  (85 files, 872 passed / 2 skipped live E2E), `benchmark:verify`,
  `benchmark:quality:verify`, `capabilities:check`, `package:check` — all pass.
- CI covers Node 18/20/22 `build-and-test` and Windows `build` on this commit
  after push.

## Cross-platform / Node version smoke

All cells used the same retained tarball installed with lifecycle scripts
disabled, completed MCP `initialize` + `tools/list` over stdio, required server
version 3.2.1, found the 7 current tools, and terminated. No search or
extraction tool was called. `fasm.cmd doctor --json` reported 16 providers and
`status: present`, and printed no proxy or credential values.

| Node | Install | stdio init | Tools | Doctor | Launcher |
|---|---:|---:|---:|---|---|
| 18.20.8 | pass | pass | 7 | pass | `fasm.cmd` pass |
| 20.20.2 | pass | pass | 7 | pass | `fasm.cmd` pass |
| 22.23.1 | pass | pass | 7 | pass | `fasm.cmd` pass |
| 24.14.1 | pass | pass | 7 | pass | `fasm.cmd` pass |

Note: the historical v3.2.0 evidence reported 8 tools; the 8th was the removed
`free_search_news`, so 7 is the current authoritative count (matches the
generated capability matrix and `capabilities:check`).

## Remaining gates before publish

- Bounded release live smoke (1 English + 1 Chinese query) requires explicit
  authorization and a clean exit.
- `git push`, npm publish, tag/Release, MCP Registry, and external directory
  updates each require separate authorization.

## Bounded release live smoke (2026-08-11)

From the retained tarball installed in a clean temp dir, two serial queries via
the packed `fasm.cmd`, Top-3, Wikipedia only, at least 10 seconds apart, zero
retries, zero enrichment:

| Query | Language | Results | Quality gate | partialFailures |
|---|---|---:|---|---|
| Model Context Protocol | en | 3 | sufficient (basketRelevance 0.64) | none |
| 模型上下文协议 | zh | 3 | sufficient (basketRelevance 0.67) | none |

Point-in-time availability observation only; not an availability, latency, or
accuracy claim. No result text, titles, or URLs were retained.
