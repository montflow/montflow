# Changelog

## 0.0.2

### Patch Changes

- [#8](https://github.com/montflow/montflow/pull/8) [`f499e05`](https://github.com/montflow/montflow/commit/f499e05787abf1154d411836d68073c258ff8a49) Thanks [@DanielMontilla](https://github.com/DanielMontilla)! - First tracked release of the five `mf-*` CLIs. They are versioned and tagged
  together in one fixed group and are still never published to npm; the version
  exists so `mf-<cli> version` and the update check have something to compare.

Releases: this package is versioned and tagged by changesets but never published to npm; run the CLIs from a git checkout.

## Unreleased

### Added

- `mf-prompts doctor` reads `payload.json` and checks or repairs every declared skill; `doctor --check` is report-only and `mf-prompts:check` ends with it
- Initial tracked release of the `mf-prompts` CLI.

### Changed

- **Breaking:** the doctor is manifest-driven and uses the shared `@montflow/payload` engine; a locally edited packaged skill is `stale` and repair overwrites it, while an unlisted skill is user data
- Doctor statuses are one vocabulary across packages: `ok`/`missing`/`stale`/`mismatched`/`blocked` in check mode and `present`/`installed`/`repaired`/`blocked` in repair mode

### Fixed

- A `skills:` reference resolves only to a store directory containing `SKILL.md`, so an empty directory no longer verifies clean
- `/mf-prompts verify --strict` parses and threads the flag, so the slash surface can promote an unresolved reference to an error
