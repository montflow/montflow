# Changelog

## [1.2.0] - 2026-11-03

### Changed

- Discovery tries `mf-skills list` first and falls back to Glob/Grep only when the binary is unavailable, stating the fallback

## [1.1.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter

## [1.0.1] - 2026-07-09

### Added

- Added `executing-skills` as required dependency in frontmatter
- Added prerequisite alert after "When To Use" referencing executing-skills

## [1.0.0] - 2026-07-08

### Added

- Initial release of finding-skills
- Skill discovery and matching workflow from user intent
- Standardized skill format with frontmatter, pipeline, and reference sections
