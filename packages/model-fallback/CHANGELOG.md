# Changelog

## Unreleased

### Added

- `payload.json` declaring the `model-fallback` prompt as a `prompt` payload installed into `.agents/@montflow/prompts/model-fallback.json`
- `mf-model-fallback doctor [--check]`: report-only check or repair through the shared `@montflow/payload` engine

### Changed

- **Breaking:** the doctor is manifest-driven; a locally edited installed prompt is `stale` and repair overwrites it, while an unlisted prompt in the same store is user data and is never deleted
- Doctor statuses are one vocabulary across packages: `ok`/`missing`/`stale`/`mismatched`/`blocked` in check mode and `present`/`installed`/`repaired`/`blocked` in repair mode

Releases: this package is versioned with the workspace; it is private and is never published to npm.
