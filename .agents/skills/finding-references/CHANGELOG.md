# Changelog

## [2.2.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter

## [2.1.0] - 2026-07-24

### Added

- New pipeline step 3: clone missing references from Reference Registry URLs
- `.gitkeep` creation in `.agents/references/` during reference lookup

### Changed

- Pipeline now auto-clones references not found locally using registry URLs

## [2.0.0] - 2026-07-22

### Changed

- Updated description to reflect plain git clone approach (not submodules)
- Changed filesystem path from `references/` to `.agents/references/` in registry table and prose
- Updated migration note to reference new `.agents/references/` path

## [1.1.0] - 2026-07-14

### Changed

- Renamed skill from `finding-vendors` to `finding-references`
- Changed filesystem path from `vendor/` to `references/` in registry table and prose
- Updated all prose from "vendor" to "reference" terminology
- Updated group from `vendors` to `references`
- Added migration note referencing old `vendor/` path

## [1.0.1] - 2026-07-09

### Added

- Added `executing-skills` as required dependency in frontmatter
- Added prerequisite alert after "When To Use" referencing executing-skills

## [1.0.0] - 2026-07-08

### Added

- Initial release of finding-references (formerly finding-vendors)
- Reference discovery and exploration workflow
- Reference registry table with paths and URLs
- Standardized skill format with frontmatter, pipeline, and reference sections
