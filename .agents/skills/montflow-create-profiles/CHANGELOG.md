# Changelog

## [1.3.1] - 2026-11-03

### Changed

- `mf-profiles verify` / `mf-prompts verify` warn (`1 warning`, exit 0) on a declared skill that is not installed; treat any warning as a fix item, and a check mark alone no longer claims to validate every declared skill

## [1.3.0] - 2026-11-03

### Changed

- Skill discovery runs through `mf-skills list`, and `mf-profiles verify <name>` is the mechanical verify for the file shape and every declared skill; the checklist stays for what the verifier cannot judge

## [1.2.0] - 2026-10-06

### Changed

- Renamed from `authoring-profiles` to `montflow-create-pi-profiles`, matching the Montflow skill standard (`montflow-<verb>-pi-<package>`)

## [1.1.0] - 2026-10-06

### Changed

- The skill authors `PROFILE.md` directly from its rules; dropped the `/mf-profiles-cli` mechanical reference and its "prefer the CLI over hand-writing files" guidance
- Corrected the profile store path to `.agents/@montflow/profiles/`

### Added

- `id`, `author`, `version`, and `license` frontmatter
