# Changelog

## [1.2.1] - 2026-11-03

### Changed

- `mf-profiles verify` / `mf-prompts verify` warn (`1 warning`, exit 0) on a declared skill that is not installed; the audit and verify steps treat that warning as a fix item instead of claiming the check validates every declared skill

## [1.2.0] - 2026-11-03

### Changed

- Skill discovery runs through `mf-skills list`, and `mf-profiles verify <name>` is the mechanical verify before the GATES.md and subjective checklist

## [1.1.0] - 2026-10-06

### Changed

- Renamed from `modifying-profiles` to `montflow-modify-pi-profiles`, matching the Montflow skill standard (`montflow-<verb>-pi-<package>`)

## [1.0.1] - 2026-10-06

### Fixed

- Corrected the profile store path to `.agents/@montflow/profiles/`

## [1.0.0] - 2026-09-05

### Added

- Initial release of modifying-profiles
- Pipeline for editing, updating, and auditing existing agent profiles
- GATES.md with modification, structure, and quality validation phases
