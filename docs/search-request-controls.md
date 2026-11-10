# Search request controls

Both `free_search` and `free_search_advanced` accept:

- `include_domains` / `exclude_domains`: arrays of domain names or HTTP(S)
  domain/path scopes. Domains include subdomains. Paths are case-sensitive and
  match an exact path or its descendant paths: `/docs` does not match
  `/docs-old`. Exclusion wins. Repeated slashes are preserved, so a scope of
  `example.com//` never becomes host-wide. Invalid scopes reject the request.
  These constrain **returned URLs**, not outbound network connections. Providers,
  proxies and optional enrichment services still receive requests.
- `query_mode`: `standard` (default) or `literal`. Literal preserves the supplied
  query string across local routing and retries and disables local expansion.
  It cannot control a provider's own interpretation, spelling correction or
  result ranking. It is not an exact-phrase guarantee.
- `privacy`: `standard` (default) or `no_retention`. No-retention bypasses local
  query/result cache reads and writes, request collapsing and query/result logs,
  including delayed writes and asynchronous provider errors. It skips the
  shared semantic bridge. Request-local asynchronous context isolates concurrent
  standard searches. It does not erase pre-existing entries or prevent upstream
  services from seeing or retaining queries and requested URLs. Aggregate health,
  rate limiting and request metrics remain active; this is not anonymity or a
  network-isolation promise.
- `language`: `auto` (default), `en`, or `zh`; omitted calls keep their prior detected-language behavior.
- `market`: `US`, `CN`, `MY`, or `SG`, independent from language. See
  [provider-native filters](provider-native-time-and-market.md).
- `time_range` plus `time_range_mode: "provider_native"`: available only with
  explicit `engines: ["duckduckgo"]`; no cross-provider fallback or expansion.
  Time-filtered searches bypass the exact cache. These are native upstream hints,
  not locally verified publication dates.

`free_search.limit` defaults to 10 (1–50); `count` is its only alias.
`free_search_advanced.count` defaults to 5 (1–20); `limit` is its only alias.
Supplying both is allowed only when their values agree. Advanced search also
accepts explicit `engines`. Unknown arguments are rejected by the actual MCP
input schema, including misspelled scope, privacy and spending controls. Neither
schema silently strips unsupported restrictions.

Scope is applied to each adapter's results before the local result budget,
provider fallback usability checks, URL/title deduplication, scoring, quality
stopping decisions and enrichment. Scope remains attached to expansion and
fallback requests. A provider may itself truncate its result page before local
filtering, so restrictive scopes can yield fewer results.
