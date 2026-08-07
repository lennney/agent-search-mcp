# ADR-20260808: Query-sticky user-owned proxy pools

## Status

Accepted.

## Context

DDG and Sogou already support an explicitly configured HTTP(S) proxy without
reading ambient system proxy variables. A single unhealthy proxy can make the
provider unavailable, while rotating exits after CAPTCHA, challenge, 403, or
429 would evade upstream controls and make search-quality captures
non-comparable.

## Decision

The shared engine HTTP transport accepts optional engine-specific JSON proxy
pools through `DUCKDUCKGO_PROXY_URLS` and `SOGOU_PROXY_URLS`.

- A pool contains 2-16 unique HTTP(S) proxy URLs.
- The logical query deterministically selects the first exit. DDG bootstrap,
  preload, HTML, and Lite requests therefore keep one transport identity.
- Only a thrown transport failure advances to another configured proxy.
- A transport-failed proxy is skipped for 60 seconds while another healthy
  configured proxy exists.
- Any HTTP response returns immediately to the adapter. CAPTCHA, challenge,
  403, and 429 remain provider failures and cannot rotate the proxy pool.
- The existing engine-specific single-proxy setting has precedence. The
  existing explicit shared proxy remains the final fallback configuration.
- Formal competitive drivers receive no proxy environment variables and keep
  one fixed evaluation exit.

## Consequences

Users can provide redundant exits they control without changing MCP tool
signatures or adding dependencies. Search sessions remain coherent and
challenge cooldown remains enforceable. The pool does not promise availability
when every configured transport or the upstream provider is unavailable.
