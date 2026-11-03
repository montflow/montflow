# Changelog

## Unreleased

### Added

- Manifest-driven payload support shared by every `mf-*` CLI: `PayloadManifest`, `loadManifest`, `namesOf`, `nameAt`, `entriesOf`, `expectedTarget`, and the four kinds `skill`, `profile`, `prompt`, and `tier`
- One compare/install engine (`runPayloadDoctor`) with report-only and repair modes, atomic writes, symlinked-tree blocking, and a coded fix for a payload that cannot be repaired
- One embedded-payload generator (`generateEmbeddedPayload`) replacing the per-package copies, so a compiled binary keeps a working `doctor`

### Changed

- Doctor statuses are one vocabulary: `ok`/`missing`/`stale`/`mismatched`/`blocked` in check mode and `present`/`installed`/`repaired`/`blocked` in repair mode
- Check mode performs no write and no directory creation; repair mode installs or rewrites a manifest-owned artifact and never deletes an unlisted file

Releases: this package is versioned with the workspace; it is private and is never published to npm.
