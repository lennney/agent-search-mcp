---
type: Changelog
title: Agent Search MCP CHANGELOG
timestamp: '2026-07-20T23:35:20+08:00'
description: 版本变更记录
tags:
- agent-search-mcp
- changelog
---
# Changelog

## Unreleased

- test: Completed a two-call bilingual Wikipedia runtime smoke with explicit
  `en/us-en` and `zh/cn-zh` contexts, Top-3, zero retries, conservative pacing,
  and no retained result text; this remains availability evidence, not a
  search-quality claim.
- refactor: Moved provider-attempt admission and completion behind an atomic,
  idempotent `HealthTracker` lease so only one half-open probe can run and the
  orchestrator no longer owns circuit-success, failure, or suspension writes.
- test: Added offline runtime coverage proving half-open leases are released on
  cancellation, request-budget rejection, rate-limit wait failure, and every
  completed outcome without turning pre-dispatch exits into provider failures.
- refactor: Resolved one bilingual search request context per logical query and
  propagated it through collapse/cache keys, retries, waterfall expansion, and
  provider dispatch; DDG and Wikipedia now receive bounded language/region
  intent while Bing/Yandex only consume the language header supported by the
  current HTML contract. Exact search cache keys are versioned to v2.
- refactor: Replaced import-time search infrastructure singletons with one
  injectable, lazily defaulted `SearchRuntime`; stdio/HTTP tool servers and
  health resources now share the process-owned cache, cooldown, rate-limit,
  metrics, policy, configuration, and provider-dispatch state.
- test: Scoped pending-request collapsing by runtime and added offline coverage
  proving identical queries cannot cross runtime boundaries and `free_only`
  rejects a paid adapter before dispatch.
- feat: Made `search_with_synthesis` return the canonical Search Evidence
  Packet and output schema with an added `prompt_hint`; added explicit adapter
  scheduling/attempt telemetry while leaving uninstrumented HTTP request count
  as `null` instead of reporting false precision.
- test: Added a synthetic URL canonicalization calibration set and a
  query-preserving v2 candidate, while pinning production deduplication to v1
  until pooled-qrels calibration authorizes a cache/evidence contract change;
  refreshed the deterministic format/Token baseline for the intentional
  canonical-warning and evidence-metadata output changes.
- refactor: Replaced dispersed provider identity, metadata, credential,
  family, weight, waterfall-phase, and invocation facts with a static provider
  catalog plus a runtime executor registry; the orchestrator no longer imports
  individual adapters or maintains an invocation switch.
- refactor: Added a shared HTML search transport and failure-classification
  seam for Bing and Yandex while keeping provider-specific DOM parsers;
  strict orchestration now preserves HTTP, challenge, parser-drift, timeout,
  and cancellation failures without changing direct adapter soft-failure.
- fix: Decoded Wiby HTML entities at the adapter boundary, rendered one
  canonical prompt-injection warning instead of duplicating it during passage
  formatting, and kept the first provider latency sample at its observed value.
- docs: Added a full source-level design audit with adopted, proposed, deferred,
  and rejected competitor patterns plus a proposed Provider Runtime Registry
  ADR; corrected provider-family and waterfall-policy documentation drift.
- fix: Switched Baidu's single-page request to structured JSON with same-response
  HTML compatibility, classified verification pages and exact CAPTCHA redirects
  as `bot_challenge`, and stopped internal redirects before any second provider
  request.
- fix: Made the Wikipedia adapter preserve MediaWiki's query-matched search
  passage after stripping highlight markup, with article extracts retained as
  a fallback, so downstream relevance scoring receives the evidence that made
  the page match.
- fix: Stopped exact Top-N completion and ordinary snippet truncation from
  being promoted to `request_budget` failures; genuinely rejected results and
  fully consumed evidence budgets remain machine-readable exhaustion reasons.
- feat: Added a package-shipped `agent-search` Agent Skill with bounded quick,
  verification, Chinese-source, and URL-extraction routes, explicit tool
  availability checks, and approval gates before setup changes.
- test: Added a zero-network Search Evidence Packet demo that replays synthetic
  same-family deduplication, visible fallback failure, bounded quality-gate
  stopping, and compact MCP text output through production helpers.
- test: Added an offline-only 30-query bilingual, three-system comparison
  suite with a preregistered evergreen query contract, registry-derived
  Agent Search profile, deterministic Latin-square dry run, Top-5 capture
  completeness gate, and full synthetic pooled-report acceptance.
- test: Added resumable pointwise AI review and disagreement adjudication with
  three pinned model-family profiles, fixed Structured Outputs limits,
  per-stage budget checks, pricing/token evidence, and drift-safe checkpoints.
- test: Gave the subprocess-based npm package manifest assertion an explicit
  timeout so it remains stable under the full parallel Vitest workload.
- fix: Derived the `free_search` adapter count from the selectable provider
  schema so tool metadata cannot retain a stale inventory.
- docs: Aligned the local npm/Registry description source with the current
  free-first, zero-key English/Chinese search positioning.
- docs: Added an inspectable-evidence table, corrected the bounded CLI example
  to request JSON, and linked the current competitive landscape in both READMEs.
- docs: Added explicit free Tavily alternative and self-hosted AI-agent search
  intent language, product-page links, and a bounded CLI contract example to
  both README files.
- docs: Updated the npm dist-tag note after verifying `latest=3.2.0` and
  `beta=3.2.0-beta.0` from the public npm API.
- docs: Recorded that the GitHub repository homepage still needs the website
  canonical product URL; no external setting was changed while GitHub was
  logged out.

## v3.2.0 (2026-07-26)

> **Headline: Free by default, paid quality escalation when explicitly enabled,
> with auditable evidence, budgets, and safer cross-platform operation.**
>
> ℹ️ **Pre-release**: `v3.2.0-beta.0` was published on npm (tag: `beta`) on
> 2026-07-27 for server validation before this stable release. The beta is
> identical to this stable candidate in features.

### 📢 Why Update

- Zero-key users keep the complete default search path; merely configuring an
  API key no longer authorizes paid requests.
- BYOK users can explicitly choose `quality_escalation` or `paid_first`, while
  `free_only` provides a hard no-spend policy.
- Search failures, provider families, request budgets, evidence provenance, and
  routing stop reasons are machine-readable instead of being hidden as empty
  results.
- Release verification replays one retained tarball across Windows and Linux
  with Node 18, 20, and 22. Exact artifact evidence is linked from the release
  notes. This release makes no live search quality or availability claim.

### Features

- Added Wiby as a zero-key, official JSON small-Web source. It runs late in the
  free waterfall, does not retry shared-service failures, and retains the
  attribution required by Wiby's API terms.
- Added optional Tencent Web Search API, Bocha, and Serper adapters for users
  who bring their own credentials. Default `free_first` routing does not call
  them.
- Added one provider-routing policy interface shared by parallel and waterfall
  search. The default `free_first` mode never spends configured optional API
  credentials; `quality_escalation`, `paid_first`, and `free_only` are explicit
  alternatives. Default routing selects only the first configured provider in
  the candidate order; multiple optional providers require explicit selection.
- Bounded live E2E behind explicit `LIVE_E2E=true` authorization, a maximum of
  two network operations, a 10-second minimum interval, cleared optional
  credentials, and a one-attempt search budget.

### Runtime and quality infrastructure

- Made lint warning-free and enforced `--max-warnings 0`. Runtime and adapter
  diagnostics use the structured stderr logger; human-facing CLI output has a
  file-scoped lint exception.
- Replaced permissive third-party JSON casts in Brave, Tavily, and the semantic
  bridge with defensive `unknown` parsing and bounded result validation.
- Centralized adapter IDs so MCP schemas, CLI validation, routing, and tests
  cannot drift as providers are added.
- Mapped Tencent WSA to the Sogou provider family and Serper to the Google
  family so adapter overlap cannot inflate independent-source confidence.
- Removed the implicit all-engine selection from `free_search_advanced`; it
  now obeys `free_first` and cannot spend because an API key is present.
- Aligned MCP Registry credentials and spend controls with the engine registry,
  with a regression test for package name, description, version, and optional
  provider credentials.
- Restored the declared Node 18.17 runtime contract by keeping Pino on its 9.x
  line. Pino 10 pulled `thread-stream` 4, whose package metadata requires
  Node 20 even though a basic Node 18 runtime smoke could still start.
- Updated the locked MCP SDK transitive dependency to
  `@hono/node-server` 1.19.15, the Node 18-compatible security backport for
  GHSA-frvp-7c67-39w9, without forcing the Node 20-only 2.x line.
- Added an offline, system-neutral comparison capture importer. External search
  exports are bounded, license-disclosed, query-set-bound, hashed, and
  normalized into the existing traced pooling contract without adding a
  competitor SDK or credential path to the product runtime.
- Generated the bilingual public engine/tool/control matrix from the runtime
  registries and bounded configuration metadata. Server registration,
  `search://capabilities`, and README drift checks now share those sources
  instead of maintaining separate tool and credential lists.
- Added a dependency-free bilingual query-classifier experiment and a
  docs/news/code/general routing benchmark. The candidate changes proposed
  routes, but remains outside production because no completed quality evidence
  proves an improvement.
- Added an opt-in, restart-safe exact-result cache behind a replaceable store
  interface. Versioned hashed keys bind search policy and freshness; atomic
  local files fail open and never reuse stale, malformed, empty, or
  budget-exhausted responses. A portable benchmark gates Linux and Windows on
  Node 18/20/22 without adding native or vector dependencies.
- Added a replaceable provider-cooldown store with memory and opt-in local-file
  adapters. CAPTCHA/rate-limit suspensions survive process restarts without
  persisting queries or credentials; expired/corrupt state fails open, and
  cooldown/policy skips now remain visible in `partialFailures`.
- Added one request-level search budget across actual adapter attempts,
  end-to-end elapsed time, admitted raw results, and evidence characters.
  Parallel, waterfall, retry, and query-expansion paths share the same ledger;
  exhaustion returns observed/limit metadata plus `budget_exhausted` instead of
  an ambiguous empty success. `fasm doctor` validates budget overrides.
- Added a local-only, read-only `fasm doctor` command with a versioned JSON
  report. It diagnoses Node/platform support, zero-key and optional-provider
  configuration, engine policy, explicit proxies, and the optional semantic
  bridge while exposing only `present`/`missing`/`invalid` states and
  configuration provenance—not credential values.
- Replaced the optional Python/ddgs subprocess path with the project-owned
  DuckDuckGo Web → HTML → Lite chain. DDG and Sogou now share an explicit,
  request-local Undici proxy transport with per-engine overrides, credential
  redaction, cancellation propagation, and no ambient proxy-variable pickup.
  Development-only scripts are no longer shipped in the npm artifact.
- Added a native DuckDuckGo Web representation using the page-issued,
  exact-allowlisted preload URL before HTML/Lite fallback. Added structured
  adapter errors and immediate provider cooldown for DDG/Sogou bot challenges.
- Added a privacy-preserving runner-qualification gate that verifies two
  non-empty configurations, provider-family diversity, and distinct ranking
  shapes before live capture or AI review.
- Made the primary `free_search` and `free_search_advanced` result a shared,
  schema-declared Search Evidence Packet. MCP clients receive canonical
  `structuredContent`; the text channel is a compact view rather than a
  duplicate JSON contract.
- Added completed-qrels calibration for the internal routing relevance floor.
  Protected pools retain per-system routing signals while blinded review
  packets omit them; small or label-unbalanced runs emit diagnostics without
  recommending a production threshold.
- Made semantic-enabled routing evaluate the transformed display basket at
  every checkpoint before skipping later free/optional phases or query
  expansion. Execution metadata now identifies the gate as `pre_semantic` or
  `post_semantic`.
- Unified parallel and waterfall result normalization behind one search-evidence
  interface so domain policy, deduplication, scoring, output eligibility, and
  the routing quality gate cannot drift between execution modes.
- Added quality-aware batch and waterfall stopping. Execution metadata now
  exposes `stop_reason` plus the observed relevance, confidence, result-count,
  and independent-provider-family gate instead of treating raw result count as
  sufficient evidence.
- Added one bounded DuckDuckGo Lite attempt after HTML HTTP 202. HTML and Lite
  remain one logical provider, share the original deadline/cancellation path,
  and never increase corroboration.
- Added deterministic query-aware passage selection and response-level evidence
  budgets. Full results now expose separate passage, publication, extraction,
  provenance, relevance, and corroboration signals while compact placeholders
  retain their source list.
- Added a review-gated search-quality benchmark with hashed raw traces,
  per-engine outcomes, graded ranking metrics, citation support,
  latency/failure dimensions, and slice reporting. Answer-only metrics remain
  explicitly unmeasured when no synthesized answer exists. Bootstrap fixtures
  are ineligible for public quality claims.
- Added dedicated benchmark query-set and engine selection, a real non-empty
  bilingual reviewer-pipeline capture, and two provenance-blinded reviewer
  packets. A CI verifier checks hashes, license metadata, candidate coverage,
  opaque IDs, shuffled rank, and pending-human status. The single-engine pilot
  remains ineligible for quality claims.
- Added deterministic multi-system result pooling with canonical URL
  deduplication, retained per-system ranks and trace hashes, provenance-blinded
  reviewer packets, mode-aware reviewer validation, and an explicit
  disagreement/adjudication gate. Human review remains a legacy-compatible
  option while AI review is the default path.
- Added completed-adjudication comparison reports that reconstruct each
  system's original ranking and report nDCG@5, Precision@5, pool-relative
  Recall@5, reciprocal rank, Success@5, citation support, latency, failure
  disclosure, and slices without inventing answer-correctness metrics.
- Added pre-adjudication reviewer reliability evidence: raw agreement,
  pairwise quadratic-weighted Cohen's kappa for relevance, and pairwise
  Cohen's kappa for citation support. Undefined no-variance pairs remain
  explicit instead of being reported as perfect agreement.
- Added claim-readiness gates that keep completed small pilots
  ineligible for public quality headlines below 30 adjudicated rows and 30
  distinct queries, and mark slices ineligible below 10 rows/distinct queries.
- Added deterministic 2,000-resample paired-bootstrap 95% confidence intervals
  for per-system retrieval and latency deltas. Public-claim readiness now
  requires uncertainty reporting for every system pair.
- Added an auditable AI-as-judge path: two blinded pointwise reviewers from
  different model families, third-family disagreement adjudication, strict
  structured output, checkpointed verdict hashes, and explicit
  `ai-reviewed`/`ai-judged` report labels.
- Unified all 12 search adapters across MCP, advanced search, CLI, and waterfall routing.
- Split result signals into `relevance`, normalized `confidence`, and independent `source_count`; retained `score` as a deprecated compatibility alias and mapped legacy `MIN_CONFIDENCE=2/3` values to source count.
- Added explicit MCP protocol readiness metadata to `/health` and allowed the
  `2026-07-28` routing and W3C trace headers through HTTP CORS without claiming
  production wire compatibility.
- Added an isolated, private Node.js 20+ MCP `2026-07-28` prototype with
  pinned SDK v2 beta.5 packages, explicit modern negotiation, legacy fallback,
  secure HTTP defaults, stdio support, and structured `free_search` results.
- Added a real-HTTP MCP 2026 behavior matrix for CORS/Origin enforcement,
  Bearer authentication, W3C trace propagation, cancellation, cache hints,
  and automatic tool-list cache invalidation.
- Added a capture/replay benchmark with production execution telemetry, frozen fixtures, locked `gpt-tokenizer`, and a CI regression gate. Historical 30-query measurements remain published with their environment scope.
- Secured HTTP MCP mode with required Bearer authentication and browser Origin allowlisting. Unauthenticated mode now requires explicit `HTTP_ALLOW_UNAUTHENTICATED=true`.

### Removed

- Removed the dedicated `free_search_news` tool and Bing News RSS path before
  release because bounded live validation could not establish a dependable RSS
  response. General Web search remains available, but the product no longer
  advertises an enforceable news time-range capability.

### Fixes

- Block npm publication from a dirty Git worktree and verify the complete
  generated tarball file list against a reviewed manifest after the clean build.
- Restored Node 18 Streamable HTTP by installing Node's built-in Web Crypto
  implementation only when the runtime does not expose `globalThis.crypto`.
- Default test runs no longer call live search/extraction providers. The two
  network E2E cases require the explicit `test:e2e:live` command.
- Live runner qualification now waits 10 seconds between query groups by
  default, rejects unsafe sub-second pacing, and never retries failed probes
  automatically.
- Runner qualification automation now fails closed with exit code 2 when the
  network exit is insufficient, while retaining the redacted diagnostic report.
- Fixed packaged `fasm` startup on Windows by resolving the executable entry
  against the CLI module, corrected compiled version detection so update checks
  use the root package version, and bounded waterfall query expansion to one
  generation instead of recursively re-expanding generated queries.
- Explicitly requested optional API adapters with missing or blank credentials
  now return a structured `permission_denied` failure instead of silently
  producing an empty result set.
- Preserved Sogou cookies across trusted HTTPS redirects, rejected protocol
  downgrade, classified `/antispider/` as `bot_challenge`, corrected the DDG
  rate-limiter key, and added a descriptive Wikipedia API User-Agent.

- Deprecated the non-functional `free_search_advanced.time_range`
  compatibility field without removing its schema. Requests that provide it
  now fail before any engine call with a machine-readable
  `UNSUPPORTED_FILTER` instead of silently returning unfiltered results.
- Apply include/exclude domain policy before title and URL deduplication, use
  exact host/subdomain matching, and fail closed for invalid include filters.
  Excluded or lookalike domains can no longer suppress an allowed same-title
  result.
- Count corroboration by independent upstream provider family rather than
  adapter name. DuckDuckGo/Bing no longer double-count the same result or
  inflate `source_count`; empty engine arrays now fall back to the result's
  declared source.
- Preserve explicitly selected adapters from the same provider family as a
  sequential failure/low-quality fallback while keeping their corroboration
  count at one.
- Align the Slim Guard evidence validator and frozen-fixture fallback with a
  versioned provider-family contract instead of equating adapter count with
  `source_count`.
- Made explicit engine selection authoritative in parallel mode, and made
  optional API results pass the quality gate before waterfall query expansion.
- Corrected parallel phase/early-stop metadata, rechecked the completed free
  basket before optional escalation, and preserved per-result provenance from
  expanded queries.
- Made the DDG Lite table parser associate each snippet with its neighboring
  result row, reject sponsored rows and DOM-equivalent captcha challenges, and
  mark a combined HTML/Lite failure non-retryable.
- Rejected zero, fractional, negative, or oversized search counts before they
  can create a non-progressing waterfall batch.
- Preserved explicit engine outcomes in the search orchestrator so thrown
  upstream errors no longer disappear as empty result sets and are reported in
  `partialFailures` while fallback continues.
- Propagated MCP cancellation through search orchestration, rate-limit waits,
  retry backoff, adapter HTTP requests, and content enrichment. Requests with a
  caller-owned signal bypass in-flight request sharing. The isolated SDK v2
  entry forwards its handler signal through a separate execution context.
- Made content enrichment confidence-neutral: extracted text improves snippets
  but does not count as independent corroboration.
- Unified parallel and waterfall cache keys and enabled cache reads for
  waterfall execution.
- Made waterfall search honor an explicit engine allowlist instead of calling
  every fixed phase.
- Replaced empty Wikipedia OpenSearch descriptions with bounded MediaWiki
  article extracts and route CJK queries to Chinese Wikipedia.
- Made lexical relevance sensitive to Latin/CJK query-term coverage instead
  of assigning the same score to every partial match.
- Corrected `search_with_synthesis` to use normalized 0-1 confidence, keep
  source-count filtering separate, preserve legacy 2-3 inputs, and report each
  result's actual source provenance.
- Corrected stable Streamable HTTP lifecycle handling: stateless SDK v1
  server/transports are now created per request, notifications no longer
  collapse into empty HTTP 500 responses, and SDK v2 auto-mode clients can
  fall back cleanly over HTTP and stdio.
- Hardened the experimental 2026 HTTP boundary against duplicate
  `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`, and `Mcp-Param-*` fields
  before Node combines them. Added real-socket coverage for case-insensitive
  names, integer canonicalization, missing headers, and malformed Base64.
- Forwarded W3C trace context from the experimental HTTP request into the
  search execution boundary while keeping it out of logs.

### Documentation

- Added a fixed-commit source audit of Tavily, Exa, Brave, Firecrawl, SearXNG,
  DDGS, two recent open search MCPs, Vane, GPT Researcher, Open Deep Research,
  and Jina DeepResearch. Updated the architecture boundary between deterministic
  MCP retrieval and the future Search Agent layer.
- Corrected the competitor table: current Tavily local MCP and Exa hosted MCP
  have limited no-user-key paths, while Agent Search's distinction is a
  self-run multi-source router without a single vendor gateway.
- Recorded the P1 evidence-packet contract and its reproducible 1200/600/360
  character benchmark scenarios.
- Documented established search-evaluation methods and an optional,
  dependency-free Slim Guard evidence handoff contract.

- Added the Agent Search-only core evidence track to both active roadmaps;
  Slim Guard remains a separate, unchanged product in this implementation.
- Restored the historical 28.7% / 35.5% token and 75% engine-call measurements in README and promotion drafts with explicit query-set and environment boundaries.
- Added the MCP ecosystem/2026 readiness plan and the Git-authoritative,
  Hermes-projection decision for multi-device planning.
- Documented the experimental 2026 entry, its stable-domain boundary, and the
  current conformance-suite coverage gap.
- Added reproducible P2 fallback evidence and an isolated Node 20/22
  experimental CI matrix.
- Added reproducible MCP 2026 routing-header evidence and closed the
  `Mcp-Param-*` canonicalization/duplicate gate.
- Added a redacted MCP 2026 P2 HTTP capture with exact SDK versions, an actual
  local runtime record, configured CI targets, and explicit failure responses.

### Semantic capabilities carried into v3.2.0

> **Headline: Semantic dedup + rerank via Model2Vec. <10ms latency. Optional, opt-in.**

#### 🆕 Features

- **Semantic dedup** (`SEMANTIC_DEDUP=true`): Removes semantically duplicate results across engines using cosine similarity on Model2Vec embeddings. Keeps higher-confidence items. Adds `removedCount` feedback.
- **Semantic rerank** (`SEMANTIC_RERANK=true`): Reorders results by semantic similarity to the query. Returns top-K most relevant results.
- **Model2Vec bridge**: Persistent Python child process (`src/aggregation/semantic_bridge.py`) running `minishlab/M2V_base_output` (256-dim, 7.2MB model). Embedding speed ~35µs/text, dedup + rerank <5ms total latency.
- **Zero dependency by default**: Semantic features are OFF by default. No Python/model2vec required unless explicitly enabled.
- **Graceful degradation**: If the Python bridge is unavailable (no model2vec installed, process crash, etc.), results pass through unchanged — no broken searches.

#### 🔧 Fixes

- **Restored zero-Python DDG fallback**: The search orchestrator no longer rejects DuckDuckGo before its Node.js HTML fallback can run.
- **Protected stdio JSON-RPC**: Circuit-breaker transitions now use the stderr logger instead of writing to stdout.
- **Closed CSDN SSRF path**: `fetch_csdn_article` now accepts only HTTPS `blog.csdn.net` URLs and rejects redirects.
- **Cross-platform build**: Replaced POSIX-only `mkdir`/`cp` commands with a Node.js build helper; `npm run build` now works on Windows.
- **CI coverage**: Restored Node.js 18/20/22 runtime coverage, added a Node.js 22 quality gate, disabled matrix fail-fast, and added a Windows build job.
- **Node.js 18 compatibility**: Pinned Cheerio to its Node 18-compatible release and close idle HTTP connections during shutdown.
- **Lint compatibility**: Pinned TypeScript to the supported 6.x API until `typescript-eslint` supports TypeScript 7.
- **Runtime metadata**: MCP initialization, HTTP health, and capabilities report the package version / Apache-2.0 consistently.

#### 📚 Documentation

- Replaced volatile competitor pricing claims with a capability-based comparison linked to official repositories.
- Marked historical benchmark percentages as exploratory until engine-call telemetry and frozen fixtures are implemented.
- Added a reusable English/Chinese promotion kit and rewrote the Juejin draft around verified capabilities.

#### 🔧 Env vars

| Variable | Default | Description |
|----------|---------|-------------|
| `SEMANTIC_DEDUP` | `false` | Enable semantic dedup |
| `DEDUP_THRESHOLD` | `0.85` | Cosine similarity threshold |
| `DEDUP_MODEL` | `minishlab/M2V_base_output` | Model2Vec model for dedup |
| `SEMANTIC_RERANK` | `false` | Enable semantic rerank |
| `RERANK_TOP_K` | `5` | Results to keep after rerank |
| `RERANK_MODEL` | `minishlab/M2V_base_output` | Model2Vec model for rerank |

#### 📊 Historical development snapshot

- **Tests**: 498 passing
- **Files**: 43 test files

### Token controls carried into v3.2.0

> **Headline: Progressive disclosure + confidence filtering. 36-58% fewer tokens in compact mode.**

#### 🆕 Features

- **Progressive disclosure**: `MAX_FULL_RESULTS` (default 3) — first N results full (title+snippet+confidence), remaining compacted (title+url+`compacted:true`). Agent can expand via `free_extract`. Saves ~36% tokens.
- **Confidence filtering**: `MIN_CONFIDENCE` (default 0=off) — filter out low-confidence results before formatting. Adds `filtered_count` to meta.
- **Traceable**: `compacted:true` marker, `compacted_count`, `filtered_count` in meta — Agent knows what's truncated and can recover.
- **New env vars**: `MAX_FULL_RESULTS` (1-20), `MIN_CONFIDENCE` (0.0-3.0)

#### 🔧 Fixes

- `compact` mode now includes `compacted_count` and `filtered_count` in meta when respective options are active

## v3.1.2 (2026-07-22)

> **Headline: Glama quality score B→A. CI, glama.json, TDQS tool descriptions optimized.**

### 📢 Why Update

- **Glama quality score**: Added `glama.json` metadata, improved tool descriptions per TDQS framework, added GitHub Actions CI — pushing score from B to A tier
- **TDQS tool descriptions**: All 3 primary tools optimized for Glama's Tool Definition Quality Score (6 dimensions per tool)
- **CI pipeline**: Added GitHub Actions CI workflow (build + lint + test across Node 18/20/22)

### 🆕 Features

- **glama.json**: Added server metadata file for Glama directory — enables maintainer verification, related servers, and richer listing
- **CI workflow**: GitHub Actions CI with Node 18/20/22 matrix, lint, build, test, and type-check steps

### 🔧 Fixes

- `free_search` tool description: Added `.describe()` for `query` parameter (was missing, causing 67% schema coverage), improved Usage Guidelines with explicit sibling tool references
- `free_extract` tool description: Added behavioral details (timeout, error modes, SSRF), improved parameter descriptions beyond schema

### 📊 Stats

- **Tests**: 448 passing (unchanged)
- **Engines**: 11 (8 free, 3 paid)
- **Glama Score**: B → A (target)

---

## v3.1.1 (2026-07-22)

> **Headline: MCP 2025 compliance + DDG News HTML fallback + structured errors.**

### 📢 Why Update

- **Agent UX**: All 8 tools now use MCP 2025 standard `registerTool` with `readOnlyHint`/`idempotentHint` annotations — agents make better tool selection decisions
- **DDG News reliability**: News search now falls back to Node.js HTML engine when Python/ddgs is unavailable — no more silent empty results
- **Streamable HTTP**: HTTP mode upgraded from deprecated HTTP+SSE to MCP 2025-11-25 Streamable HTTP transport
- **Structured errors**: Engine failures now return typed `EngineError` (timeout/rate_limited/permission_denied/etc.) with actionable suggestions — agents can self-recover

### 🆕 Features

- **C1: DDG News HTML 回退** — `searchDuckduckgoNews()` now falls back to cheerio HTML engine when Python unavailable, matching the web search behavior
- **A2: MCP Tool annotations** — All 8 tools use `registerTool()` with `{ readOnlyHint: true, idempotentHint: true }` (MCP 2025 standard)
- **A3: Structured EngineError** — New `EngineError` type with `type` (timeout/upstream_4xx/upstream_5xx/rate_limited/permission_denied/unknown) and `suggestion` fields
- **B1: Streamable HTTP transport** — HTTP mode now uses `StreamableHTTPServerTransport` per MCP 2025-11-25 spec; POST/GET/DELETE `/mcp` endpoint
- **B2: Capabilities negotiation** — Server explicitly declares `tools` and `resources` capabilities during initialization
- **D3: E2E integration tests** — 4 end-to-end tests spawning server as subprocess, verifying initialize/list-tools/tool-calls

### 🔧 Fixes

- News search no longer returns empty results when Python/ddgs is unavailable
- Error responses now include structured type information for agent self-recovery
- HTTP mode deprecated SSE endpoint replaced with standard Streamable HTTP

### 📊 Stats

- **Tests**: 448 passing (was 438), 40 test files (was 38)
- **Engines**: 11 (8 free, 3 paid)
- **Dependencies**: 5 production (unchanged)

---

## v3.1.0 (2026-07-22)

> **Headline: No more Python dependency. `npm install` is enough.**

### 📢 Why Update

- **If you're on Docker**: Remove Python from your image. Our image is now ~30% smaller and works on arm/v7.
- **If you had `ddgs not found` errors**: Gone. DDG now works without Python — automatic Node.js fallback.
- **If you want to limit tool visibility**: Use `ENABLED_TOOLS`/`DISABLED_TOOLS` to control what your agent can see.
- **If you want auto-update notices**: CLI now checks npm for new versions and tells you to `npm update -g`.

### 🎉 DDGS Independence

DuckDuckGo search now works without Python. A Node.js HTML engine (cheerio) serves as automatic fallback when Python/ddgs is unavailable. Docker image no longer includes Python — smaller, faster, architecture-independent.

- **Python preferred + HTML fallback**: ddgs is detected lazily (cached). When available, Python path is used (more stable, DDG internal API). When unavailable, Node.js cheerio HTML engine takes over automatically.
- **DDG HTML engine**: POST requests (ddgs pattern), rotating User-Agents (4 agents), HTTP 202 rate-limit detection, captcha page detection, protocol-relative URL resolution, ad filtering.
- **Docker**: Removed Python/ddgs from runtime image. Works on arm/v7 without pip compatibility issues.
- **Health reporting**: `search://health` includes `ddgs_available` boolean per DDG provider.

### 🛠 Tool Visibility Control

`ENABLED_TOOLS` / `DISABLED_TOOLS` env vars let users control which MCP tools are registered and visible to the agent. `ToolPolicy` class uses the same allow/deny pattern as `EnginePolicy`.

```bash
ENABLED_TOOLS=free_search,free_search_advanced
DISABLED_TOOLS=free_extract,fetch_github_readme
```

### 📦 npm Ecosystem

- `llms.txt` — LLM-optimized project overview for agent-based discovery
- Optimized `package.json` keywords (23 tags) and description for npm search ranking
- Updated badges (TypeScript badge, test count 438, Glama score)

### 🔧 Fixes

- `partialFailures` entries now show correct engine name (was "unknown")
- Removed unused `ENABLED_TOOLS`/`DISABLED_TOOLS` raw string fields from Config

### 📊 Stats

- **Tests**: 438 passing (was 235 at v3.0.0), 38 test files (was 21)
- **Engines**: 11 (8 free, 3 paid)
- **Dependencies**: 5 production (removed Python as hard dependency)

---

## v3.0.0 (2026-07-17)

### 🎉 Major Features

- **New free engines**: Wikipedia (clean JSON API), Startpage (Google proxy), Yandex, Mojeek → 8 free engines total
- **News search** (`free_search_news`): DDG News + Bing News RSS fallback, time-range filtering (day/week/month)
- **Language auto-detection**: CJK/Japanese/Korean/English heuristic → smart engine routing
- **Rate limit exposure**: Every search returns `rate_limits` per engine (remainingMs, nextAvailableAt)
- **Chinese optimization**: 12 authority domains (baike.baidu.com, zhihu.com, csdn.net...), 300-char CJK snippets, S/T conversion + stopword removal
- **Answer engine refactored**: `search_with_synthesis` now returns structured results + `prompt_hint` for agent-side synthesis — **zero LLM deps**, zero API keys, works on Raspberry Pi

### Architecture

- SDK bump: `@modelcontextprotocol/sdk` ^1.11.2 → ^1.29.0
- Rate limiter API: `getRateLimitInfo()`, `getAllRateLimits()`
- Engine allow/denylist via `ALLOWED_ENGINES` / `DENIED_ENGINES` env vars
- Adaptive concurrency: dynamic batch size based on engine health

### Testing

- 235 tests passing across 21 test files (was 140/13)

### Breaking Changes

- `search_with_synthesis` response format: now returns `{results, prompt_hint, meta}` instead of synthesized answer
- Removed `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` env vars (no longer needed)
- `RateLimitInfo` interface changed: `remainingMs`/`nextAvailableAt` instead of `remaining`/`resetInMs`

## v2.2.0 (2026-07-08)

### Features

- **Waterfall progressive search**...

## v2.0.0 (2026-06-22)

### Features

- **Bing search engine**: Full Bing Web Search API integration
- **Baidu search engine**: Full Baidu search API integration
- **HTTP/SSE server**: Built-in HTTP server with health check endpoints and SSE streaming support
- **Security layer**: Prompt injection protection, output boundary markers, phishing URL filtering
- **Config module**: Environment variable parsing with defaults and validation
- **Shared HTML utilities**: Common HTML parsing and content extraction module
- **Architecture fusion**: Merged best patterns from ddgs/open-websearch/brave-mcp — provider dedup, frequency scoring, token optimization

### Improvements

- Multi-engine aggregation: provider-level dedup to avoid redundant queries
- Frequency-based scoring: results verified by multiple engines rank higher
- Cross-engine confidence scoring with cosine similarity fallback
- Respect `Referer` header in HTTP requests
- Better error handling and retry logic across all engines

### Dependencies

- Added `yaml` for configuration file parsing

## v1.0.1 (2026-06-22)

### Bug Fixes

- **DDG search**: Use `ddgs` Python library as backend (bypasses anti-bot detection)
- **Logger**: Write to stderr instead of stdout (stdout reserved for JSON-RPC)
- **Default engines**: Changed from `['duckduckgo']` to `['duckduckgo', 'sogou']`

### Dependencies

- Added `ddgs` (MIT) as Python dependency for DuckDuckGo search

## v1.0.0 (2026-06-22)

### Initial Release

- **Free search engines**: DuckDuckGo and Sogou — no API keys required
- **Paid engine support**: Brave Search and Tavily (optional, with API keys)
- **Two-phase search**: Falls back from free engines to paid engines when more results are needed
- **Deduplication**: By URL (exact) and by title (Jaccard similarity)
- **Scoring & ranking**: Results scored by query relevance, multi-source confidence, and configurable engine weights
- **Formatting**: Truncated safe output with metadata (total, high-confidence count, unique engines)
- **Health tracking**: Per-provider success/failure tracking with automatic circuit-breaking (5 consecutive failures)
- **Rate limiting**: Minimum 1-second interval between requests per provider
- **Smart caching**: TTL-based cache with automatic eviction (max 1000 entries, 60s TTL)
- **URL validation**: SSRF protection blocking private IPs, localhost, and metadata endpoints
- **MCP tools**:
  - `free_search` — simple web search with automatic fallback
  - `free_search_advanced` — search with filtering, domain include/exclude, language, and confidence thresholds
  - `free_extract` — extract page content as markdown via Jina Reader
- **MCP resources**:
  - `search://capabilities` — server capabilities overview
  - `search://health` — per-provider health status
- **Environment variables**: `BRAVE_API_KEY`, `TAVILY_API_KEY`, `LOG_LEVEL`

### Compatibility

- Node.js >= 18
- Works with Hermes, Claude Code, Cursor, Windsurf, OpenClaw, and any MCP-compatible client
