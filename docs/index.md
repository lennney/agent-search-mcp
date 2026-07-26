# Documentation

This directory separates current product documentation from historical work.
A document in `archive/` may explain how a decision was reached, but it does
not define current behavior.

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
| Current priorities | [`HANDOVER.md`](../HANDOVER.md) |
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

The current release evidence records 720 passing offline tests, packed install
and stdio smoke on Windows and Linux with Node 18/20/22, and one bounded
non-empty DDG search smoke. The frozen formatting fixture reproducibly measures
28.4% compact and 30.4% compact-aggressive token reduction for that fixture.
These facts support compatibility and formatting claims, not universal search
quality claims.

## Historical material

- [`archive/plans/`](archive/plans/) — completed or superseded implementation plans
- [`archive/reviews/`](archive/reviews/) — historical code and release reviews
- [`archive/superpowers/`](archive/superpowers/) — completed planning-session artifacts
- [`evidence/`](evidence/) — retained reproducible evidence; not archived merely
  because it is old
- [`decisions/`](decisions/) — architecture decisions that remain relevant

Before adding a document, prefer updating the current authority for that
subject. Git history preserves obsolete detail; the active documentation tree
should remain small.
