# Changelog

## [1.1.0] - 2026-10-28

### Changed

- Documents the shipped output modes: the default is agent-first and compact, `--human` renders readable tables for people, `--verbose` adds detail, and the two compose.

## [1.0.0] - 2026-10-26

### Added

- Initial release: registers an https repository as a reference through `mf-references add` (or `/mf-references add`, or the `reference_add` tool), then confirms the committed entry with `show`.
- Documents the routed-add rule: a `routed add -> update` line is a notice, not a completed add; success requires the following `created`/`updated`/`present` line and exit 0, and any refusal is surfaced unchanged.

### Changed (breaking)

- Replaces the retired generic `adding-references` / `finding-references` pair. The registry table in `finding-references/SKILL.md` is gone; `.agents/@montflow/references/<slug>/REFERENCE.md` is the registry; clones stay at `.agents/references/<slug>`; `/mf-references` and `mf-references` own the lifecycle.
