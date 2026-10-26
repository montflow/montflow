# Changelog

## [1.0.0] - 2026-10-26

### Added

- Initial release: resolves a reference against the committed store with `mf-references list`, opens one entry with `show`, offers the single-entry `sync` when the clone is missing, and reports slug, clone path, purpose, URL, and ref.
- Uses `reference_find` as the in-host equivalent of the read-only lookup and defers dirty/foreign/behind/ahead/ref-mismatch truth to `mf-references status`.

### Changed (breaking)

- Replaces the retired generic `adding-references` / `finding-references` pair. The registry table in `finding-references/SKILL.md` is gone; `.agents/@montflow/references/<slug>/REFERENCE.md` is the registry; clones stay at `.agents/references/<slug>`; `/mf-references` and `mf-references` own the lifecycle.
