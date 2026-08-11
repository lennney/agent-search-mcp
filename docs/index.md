# Documentation

This directory contains current product documentation and reproducible
evidence. Completed plans and superseded reviews are retained in Git history
instead of the published documentation tree.

## Start here

- [README](../README.md) — product overview and installation
- [中文 README](../README_zh.md) — Chinese product overview
- [Architecture](architecture.md) — current modules, data flow, and boundaries
- [HTTP deployment](http-deployment.md) — authentication, origins, and proxies
- [Benchmarks](../benchmarks/README.md) — reproducible evaluation methods
- [Changelog](../CHANGELOG.md) — user-visible changes

## Current authority

| Subject | Source |
|---|---|
| Package version and dependencies | [`package.json`](../package.json) |
| Product behavior | Source code and tests |
| Current state | Source code, tests, README, and [`CHANGELOG.md`](../CHANGELOG.md) |
| Main roadmap | [Iteration roadmap](superpowers/plans/2026-07-22-iteration-roadmap.md) |
| MCP ecosystem and 2026 experiment | [Ecosystem plan](plans/2026-07-25-mcp-ecosystem-and-2026-readiness.md) |
| Search evaluation | [Benchmark documentation](../benchmarks/README.md) |
| Release verification | [Release candidate evidence](evidence/2026-07-26-release-candidate-smoke.md) |
| Competitor architecture research | [Research snapshot](research/2026-07-26-agent-search-product-architecture.md) |

## Evidence policy

Numbers shown in public documentation must point to one of these evidence
classes:

1. **Reproducible fixture** — checked into the repository with a replay command.
2. **Release verification** — bound to an exact commit, artifact hash, runtime,
   operating system, and test procedure.
3. **Dated live observation** — includes its query set and environment and is
   not presented as a general accuracy or availability guarantee.

The current release evidence records 874 passing tests with 2 skipped, packed install
and stdio smoke on Windows and Linux with Node 18/20/22, and one bounded
non-empty DDG search smoke. The frozen formatting fixture reproducibly measures
2396.0 average tokens for Normal, 1650.1 for Compact, and 1633.0 for Compact+.
That is 31.1% compact and 31.8% compact-aggressive token reduction for the
fixture.
These facts support compatibility and formatting claims, not universal search
quality claims.

## Historical material

- [`evidence/`](evidence/) retains reproducible evidence even when it describes
  a dated run.
- Completed plans, superseded reviews, distribution drafts, and internal
  operations notes are available through Git history, not the active tree.

Before adding a document, prefer updating the current authority for that
subject. The active documentation tree should remain small.
