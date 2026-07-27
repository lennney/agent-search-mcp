# DDG HTML/Lite network observation

Date: 2026-07-26 (Asia/Shanghai)
Scope: one local runner and one network exit

A read-only probe submitted an ordinary form-encoded search request to:

- `https://html.duckduckgo.com/html/`
- `https://lite.duckduckgo.com/lite/`

Both endpoints returned HTTP 202 with challenge content and produced zero
search results on this runner. No credentials were used. Response bodies and
request headers were not retained because they are unnecessary for this
negative observation.

This proves only that both representations were unavailable from this network
exit at that time. It is not evidence of universal DDG availability, a stable
rate-limit policy, or a quality/availability improvement from Lite. A
non-empty cross-runner capture remains required before making such a claim.

## Follow-up on the same runner

The normal DuckDuckGo Web page returned a page-issued preload URL under the exact
`https://links.duckduckgo.com/d.js` boundary. Fetching that page-issued URL
with one stable request identity returned non-empty JSON search results. The
production adapter now uses this representation before HTML/Lite; it does not
rotate fingerprints or treat the representations as independent evidence.

A privacy-preserving qualification run then observed 10/10 non-empty bilingual
queries for both the DuckDuckGo and Wikipedia configurations, with two provider
families and distinct candidate/ranking hashes. The artifact is
`benchmarks/reports/runner-qualification-2026-07-26-local.json`. This is runner
readiness, not relevance or product-quality evidence.

Sogou still redirected the same runner to `/antispider/` even when cookies were
continued across same-origin redirects. The adapter therefore reports
`bot_challenge` and suspends Sogou for one hour. A legitimate alternate network
exit or configured proxy remains necessary to test Sogou retrieval here.
