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
