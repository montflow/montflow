# Changelog

## 0.0.2

### Patch Changes

- [#8](https://github.com/montflow/montflow/pull/8) [`f499e05`](https://github.com/montflow/montflow/commit/f499e05787abf1154d411836d68073c258ff8a49) Thanks [@DanielMontilla](https://github.com/DanielMontilla)! - First tracked release of the five `mf-*` CLIs. They are versioned and tagged
  together in one fixed group and are still never published to npm; the version
  exists so `mf-<cli> version` and the update check have something to compare.
- Updated dependencies [[`f499e05`](https://github.com/montflow/montflow/commit/f499e05787abf1154d411836d68073c258ff8a49)]:
  - @montflow/skills@0.0.2

Releases: this package is versioned and tagged by changesets but never published to npm; run the CLIs from a git checkout.

## Unreleased

### Added

- The six spec-role profiles (`spec-appraiser`, `spec-bookkeeper`, `spec-creation-orchestrator`, `spec-execution-orchestrator`, `spec-sizing-orchestrator`, `spec-worker`) ship as installed `profile` payload and are repaired by `mf-profiles doctor`
- `mf-profiles doctor` reads `payload.json` and checks or repairs every declared profile; `doctor --check` is report-only and `mf-profiles:check` ends with it
- Initial tracked release of the `mf-profiles` CLI.

### Changed

- **Breaking:** a spec-role profile in the store is manifest-owned payload; a local edit is `stale` and repair overwrites it. An unlisted profile in the same store is user data and is never deleted
- Every shipped profile speaks the v2 vocabulary: tier loading, phase directories, derived locks, `claim` status transitions, `gate run`, `mail`, and no hand-written state
- The execution orchestrator calls `mf-specs review decide` after every round and names the `minor-deferred` closure and authorized overflow; it no longer counts rounds or severities
- The execution orchestrator names the orchestrator-only verbs; the worker and bookkeeper name only the verbs they may call

### Fixed

- A `skills:` reference resolves only to a store directory containing `SKILL.md`, so an empty directory no longer counts as an installed skill
- `/mf-profiles-cli verify --strict` parses the flag instead of treating it as a profile name, and the flag reaches `verifyAll`
