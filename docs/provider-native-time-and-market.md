# Explicit native time and market controls

Native time filtering is an opt-in provider request, not a claim that search
results have verified publication dates or that this is reliable news search.

## Public contract

Use `time_range_mode: "provider_native"`, `time_range` set to `day`, `week`,
`month`, or `year`, and explicit `engines: ["duckduckgo"]`. This restricted
mode must not escalate to paid providers or fall back to unfiltered searches.
A mode without a range, a range without the explicit mode, and any other or
mixed engine selection are invalid. Ordinary searches retain their existing
behavior. The advanced tool accepts the same explicit engine selection.

## DuckDuckGo adapter

The Web bootstrap receives DDG's native `df=d|w|m|y` parameter. Before reading
results, the adapter requires the provider-issued preload URL to contain
exactly one `df` with that value. It does not modify the signed URL to invent
proof of acceptance. Missing, conflicting, or duplicate filters fail closed.
A verified empty result stays empty. Transport errors and upstream contract
changes return failure, with no HTML/Lite fallback. Direct HTML/Lite native
requests and other providers through the runtime registry are rejected.

This verifies the filter on the provider-issued request, not the accuracy of
DDG's indexing dates or every result's publication date. No `published_at`
value is inferred from the filter. The current contract is covered by mocked
bootstrap/API tests, not by a live availability guarantee. If upstream stops
returning the filter in its preload URL, the intended outcome is a failure
until the contract is reviewed.

## Independent market and language

`language` retains the bilingual `en`/`zh` contract. Optional `market` currently
accepts `US`, `CN`, `MY`, and `SG`, mapping respectively to DDG region
codes `us-en`, `cn-zh`, `my-en` (Malaysia English), and `sg-en` (Singapore).
These values are listed in DDG's official region parameter documentation,
checked on 2026-11-10. Other unsupported mappings are not guessed.
An explicit market changes DDG's region parameter, without changing the chosen
language or Accept-Language header. When market is omitted, legacy behavior
is unchanged: English defaults to `us-en`, Chinese to `cn-zh`.

Only DuckDuckGo currently consumes this explicit market mapping. Response
request-control diagnostics distinguish the requested market and
`market_supported_by`, the market-capable adapters among those attempted. This
is a capability diagnostic, not confirmation of a successful request or
guaranteed result geography or language. Other engines must not be presented
as supporting market targeting. Market is not a hard
geographic or document-language filter.

DDG documents its URL parameters at https://duckduckgo.com/duckduckgo-help-pages/settings/params/.
The small market set uses documented DDG values; expansion requires
provider-specific evidence and tests. The Malaysia mapping deliberately selects
the English regional option rather than `my-ms`, while preserving the separate
user-selected language header.
