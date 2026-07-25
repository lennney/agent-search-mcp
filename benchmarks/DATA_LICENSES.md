# Benchmark data licenses

Project source code remains under the repository's Apache-2.0 license.
Retrieved third-party text inside benchmark fixtures is not automatically
covered by that license.

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
