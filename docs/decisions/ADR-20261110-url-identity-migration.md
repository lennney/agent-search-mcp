# URL identity migration preparation

Status: candidate only. Production remains explicitly pinned to `v1`.

The existing production URL rule removes every query parameter, lowercases the
path, ignores the scheme/port/fragment, and removes a final slash. It can merge
different pages. This change does **not** claim to fix that production behavior.

The `v2-candidate` rule preserves path case, identity parameters, scheme,
non-default port, trailing slash, fragment and duplicate-parameter value order.
It removes only the existing named tracking parameters and sorts distinct query
keys with a deterministic code-unit comparator. Invalid inputs retain their
original spelling. The candidate intentionally prefers extra duplicates over
unproven equivalence; slash and fragment equivalence require site evidence.

The synthetic pair fixture is regression coverage, not a real search-quality
benchmark. Its labels express this conservative policy and must not be presented
as independently adjudicated relevance judgments. Tracking-parameter removal and
cross-key sorting can still be wrong on unusual sites. Do not enable v2 until
representative historical results have been manually checked for false merges
and splits, including multilingual and path-sensitive sites.

Exact-cache keys now use `search-cache-key-v3` and include the active URL policy
version. Existing v2-key entries are cold misses, not reused or destructively
cleared. A future authorized policy switch produces distinct keys again. Cache
migration preparation does not itself activate the candidate.
