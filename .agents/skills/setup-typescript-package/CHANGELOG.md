# Changelog

## [1.1.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter

## [1.0.1] - 2026-07-09

### Added

- Added `executing-skills` as required dependency in frontmatter
- Added prerequisite alert after "When To Use" referencing executing-skills

## [1.0.0] - 2026-07-08

### Added

- Initial release of setup-typescript-package skill
- Package scaffolding: tsdown, tsconfig.build.json, entry fields, exports, peerDeps
- Service scaffolding: no build tooling, runtime deps, tsconfig outDir
- Common setup: package.json, tsconfig.json, lint/format/clean scripts
- Context detection: package vs service decision table
- Platform config: neutral, node, browser with export variants
