# Memory

## Context

D001 records what `mf-skills sync` installed so a workspace can report its own
state without a checkout.

Design:

- Manifest stays `Store`'s schema (`.agents/skills/.montflow-sync.json`):
  `schemaVersion`, `source` (path/remote/commit/ref/version), `syncedAt`, and
  one entry per skill with `name`, `version`, `sha256`, per-file hashes for
  D002's report, and `removed: true` when a skill leaves the source.
- Hashing uses Effect's `Crypto` service (SHA-256), never `node:crypto`: each
  file gets a digest, the skill digest is the SHA-256 of the sorted
  `path:digest` lines, so two syncs from the same source match byte for byte.
- `syncedAt` is the only moving field; `Store.same` ignores it.
- `--check` never writes. A normal sync writes only when the manifest is absent
  or would change (ignoring `syncedAt`).
- Source git facts reuse `BuildInfo.checkoutFacts` (remote/commit/ref); a
  non-git source records `path` and the source package version when present,
  with no git fields.
- Removed skills are recorded, never pruned from disk.
- `mf-skills doctor` gains a `store` field and prints one line only when a
  managed manifest exists; absent/unmanaged/corrupt stores stay silent.

## Progress

- complete: Store `digest`/`hashSkill`/`serialize`/`same`/`write`, sync manifest
  writing, doctor store line, and tests.
- Tests: first sync records source/hash/version; two syncs are byte-identical
  apart from `syncedAt`; a removed skill is recorded; `--check` writes nothing
  and a normal sync recreates an absent manifest; non-git source omits git
  fields; doctor reports the managed store and is silent without one.
- Verified: skills suite 427 passing; version suite green; scoped lint,
  format, and typecheck green.

## Open Questions

- None.

## Handoff

- D002 consumes per-file hashes for `diverged` reports and the manifest commit
  for `stale`.

## Deviations

- Added per-skill `files` hashes (beyond the required name/version/sha256) so
  D002 can name differing files without a second trip to the source.
