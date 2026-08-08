# ADR-20260808: Egress and request-fingerprint flexibility

## Status

Accepted.

Supersedes the rotation and stable-fingerprint restrictions in
ADR-20260808-sticky-proxy-pools and ADR-20260807-bilingual-search-request-context.

## Context

Product direction now requires the search server to keep serving when a provider
challenges, by rotating egress and request identity rather than only waiting out
a cooldown. The earlier ADRs deliberately forbade rotating exits after CAPTCHA,
challenge, 403, or 429 to respect upstream controls and keep quality captures
comparable. For the production server this trade-off is reversed: bounded
rotation is preferred over per-provider downtime.

## Decision

- On `bot_challenge`, 403, or 429 the engine may perform a bounded number of
  rotation attempts — switching representation, exit, or request identity —
  before entering the existing bounded cooldown.
- A single logical query no longer promises a stable User-Agent; UA/header
  variation within a provider is permitted.
- Proxy selection keeps query-sticky as the default so a logical session keeps
  one transport identity, but rotation is no longer limited to thrown
  transport failures.
- Every rotation attempt shares the existing bounded retry budget, the caller's
  cancellation signal, and `partialFailures` reporting.

## Unchanged guards

- Proxy credentials never enter errors, logs, or fixtures; ambient
  `HTTP_PROXY` / `HTTPS_PROXY` are still not read.
- Bounded cooldown and the provider circuit breaker remain.
- Formal competitive capture drivers still receive no proxy variables and keep
  one fixed evaluation exit, so cross-system quality captures stay comparable.
- No new dependency is introduced by this decision alone.

## Consequences

Production searches can now recover from a challenge by rotating, at the cost of
additional upstream load and weaker comparability for any measurement taken on a
rotating exit. Availability or quality claims must state whether rotation
occurred. The load guardrails (bounded retries, cooldown, cancellation) are
unchanged.
