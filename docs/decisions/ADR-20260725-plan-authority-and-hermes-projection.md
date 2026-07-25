---
title: "ADR: Git plans are authoritative; Hermes stores searchable projections"
status: accepted
date: 2026-07-25
owners:
  - agent-search-mcp maintainers
---

# Context

The project is developed from multiple local devices and may also be consumed by
Hermes on the Tencent host. Plans and decisions must remain available to agents
without creating two editable copies that silently diverge.

Hermes and compound-system are optimized for retrieval, reflection, and reusable
knowledge. Git is optimized for review, history, branching, and deterministic
conflict resolution.

# Decision

The canonical source of truth is the merged Git commit:

1. Architecture decisions live in `docs/decisions/`.
2. Executable delivery plans live in `docs/plans/`.
3. Pull requests and issues track review and execution, but do not replace the
   committed decision or plan.
4. Hermes stores a read-only searchable projection containing at least
   `repository`, `source_path`, `source_commit`, and `content_sha256`.
5. Local scratch notes and Hermes reflections may propose changes. A proposal
   becomes authoritative only after it is written back to the repository,
   reviewed, and committed.

There is no automatic two-way file merge between Hermes and Git. The flow is:

```text
local branch -> review/commit -> Git main -> Tencent read-only clone -> Hermes index
Hermes insight -> proposed patch/PR -> review/commit -> Git main
```

# Multi-device operating rule

- Before planning, fetch and fast-forward the repository.
- Make plan changes on a branch and commit them with the code they govern.
- An offline device may commit locally and push later; Git resolves the merge.
- The Tencent host must use a read-only working clone for Hermes ingestion.
- A scheduled job may run `git fetch --prune` and `git pull --ff-only`, then
  refresh the Hermes/compound-system index.
- Never edit the projected plan directly on the Tencent host.
- Never copy credentials, `.env` files, API keys, or private benchmark inputs
  into the projection.

# Conflict resolution

If Git and Hermes disagree, the newest merged Git commit wins. If two Git
branches disagree, normal review and merge rules apply. If a Hermes insight
reveals that the committed plan is wrong, the plan must be amended by a new
commit; the old projection is then replaced by the next index refresh.

# Consequences

- Plans remain reviewable, reproducible, and usable offline.
- Hermes can provide fast cross-device and cross-project retrieval without
  becoming a second source of truth.
- Tencent availability does not block local development.
- Every retrieved decision can be traced back to an exact repository state.

# Deployment note

The configured `tencent` SSH endpoint closed the connection during the
2026-07-25 readiness check. No remote directory or scheduled job was created.
Initialize the read-only clone and index refresh only after SSH access is
restored and the target path is verified.
