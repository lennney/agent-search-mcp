# Benchmark data licenses

Project source code remains under the repository's Apache-2.0 license.
Retrieved third-party text inside benchmark fixtures is not automatically
covered by that license.

## Synthetic evidence demo

`fixtures/evidence-demo.json` contains only original synthetic queries,
results, failures, and routing traces written for this repository. It contains
no captured search-provider text. Its `quality_claim_eligible: false` marker is
also a claim boundary: the fixture demonstrates response contracts only.

`fixtures/url-canonicalization-calibration-v1.json` is also entirely synthetic.
It contains invented URL pairs only, with no retrieved page text, provider
response, browsing history, or quality label.

## Wikipedia reviewer pilot

The following generated artifacts contain introductory extracts from English
or Chinese Wikipedia:

- `fixtures/live-reviewer-pilot.json`
- `fixtures/live-reviewer-pilot-labels.pending.json`
- `reviews/live-reviewer-pilot.reviewer-a.pending.json`
- `reviews/live-reviewer-pilot.reviewer-b.pending.json`

Wikipedia text is reused under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
The article URL stored beside each extract provides attribution to Wikipedia
contributors through the corresponding article history. Extracts may be
truncated and whitespace-normalized; those changes are declared in each
capture's `content_licenses` metadata.

The CC BY-SA notice applies to the retrieved Wikipedia text and adaptations of
that text. It does not relicense unrelated project source code.

Before checking in captures from another engine or API, verify its terms permit
redistribution and record the applicable license or restriction. A response
being publicly accessible is not proof that its text may be redistributed.

## Competitive comparison artifacts

The preregistered competitive query set, benchmark code, tests, and reports
that contain only aggregate metrics may remain in this repository. Raw search
exports, normalized captures, pooled candidates, and AI reviewer packets for
the three-system comparison are private artifacts and must be written outside
the repository.

An external system's source-code license does not grant permission to
redistribute text returned by its search providers. Before any aggregate
report is proposed for publication, review the result-content terms,
attribution requirements, and whether the aggregate can be audited without
publishing restricted snippets. `quality_claim_eligible: true` is only a
technical evidence gate; it is not a license or publication approval.
