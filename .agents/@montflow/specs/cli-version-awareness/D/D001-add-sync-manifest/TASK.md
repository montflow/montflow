---
id: D001
name: add-sync-manifest
type: execution
originator: user
depends-on: A002
related-tasks:
status: complete
---

# Task D001: add-sync-manifest

## Type: execution

## Description

Record what `mf-skills sync` installed, from which commit, and at which version, so an installed workspace can report its own state without a checkout.

## Requirements

- Writes `<target>/.agents/skills/.montflow-sync.json` holding `schemaVersion`, `source` (`path`, `remote`, `commit`, `ref`, `version`), `syncedAt`, and one entry per skill with `name`, `version`, and `sha256`.
- Deterministic: two syncs from the same source produce byte-identical manifests except `syncedAt`.
- `--check` writes nothing; a run that changes no skill files refreshes the manifest only when it is absent or would change.
- `mf-skills version` and `mf-skills doctor` read the manifest when present and stay silent when it is absent, so workspaces installed before this change keep working.
- A skill present in the previous manifest but absent from the source is recorded as `removed`; pruning it from disk stays out of scope for this task.
- Tests cover a first sync, a re-sync, a stale manifest, an absent manifest, a non-git source, and the determinism guarantee.

## Completion

- [x] Done.
