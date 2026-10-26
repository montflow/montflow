# Changelog

## [1.3.0] - 2026-10-26

### Changed

- Renamed from `montflow-create-pi-profiles` to `montflow-create-profiles`; cross-references name `montflow-modify-profiles`
- The format-source path is `packages/profiles/src/modules/profiles/`

## [1.2.0] - 2026-10-06

### Changed

- Renamed from `authoring-profiles` to `montflow-create-pi-profiles`, matching the Montflow skill standard (`montflow-<verb>-pi-<package>`)

## [1.1.0] - 2026-10-06

### Changed

- The skill authors `PROFILE.md` directly from its rules; dropped the `/mf-profiles-cli` mechanical reference and its "prefer the CLI over hand-writing files" guidance
- Corrected the profile store path to `.agents/@montflow/profiles/`

### Added

- `id`, `author`, `version`, and `license` frontmatter
