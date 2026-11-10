# Release pipeline safety

A version-tag push (`v` followed by the exact `package.json` version) runs the
same checks as pull requests before any publication:

- Linux and Windows build and full offline tests on Node 18, 20, 22 and 24.
- Lint, type, distribution, benchmark and capability checks.
- Experimental negotiation tests on Node 20, 22 and 24.

The ordered path is checks → tag/registry preflight → npm → Docker → GitHub
Release. A failed or skipped prerequisite blocks downstream publication.
Publication has no independent workflow or manual-dispatch bypass. Concurrent
runs for the same ref are serialized and are not cancelled mid-publication.

The registry helper queries `npm view <package-name>@<version> version --json`
against npmjs.org. Only an exact string match means already published. Only a
structured E404 saying that the requested version has no match means absent.
Authentication failures, network failures, unexpected JSON, package-level 404s
and ambiguous results stop publication. The tag must match before any query.

A rerun skips npm publication if the exact version already exists, verifies
that version again, then resumes downstream steps. Registry propagation delays
can therefore stop a run safely; retry only after checking the existing npm
artifact belongs to this release. Publication is not atomic across services:
a Docker failure can leave npm published and GitHub Release still absent.
Never move a release tag to different source or overwrite/reuse a package version.

Docker receives only the validated version tag, never `latest`. Any future
promotion of `latest` requires a separate deliberate, reviewed change. No
version bump, release tag, registry publish or image promotion is performed by
these code changes or their offline regression tests.
