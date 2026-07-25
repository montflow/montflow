# Changelog

## [1.3.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter

## [1.2.0] - 2026-07-22

### Changed

- Added `unit-testing` and `typescript-unit-testing` as dependencies
- Moved Vitest configuration and test script setup to `typescript-unit-testing`
- Rewrote as purely Effect-specific testing layer
- Added Effect test patterns (it.effect, layers, TestClock, ConfigProvider, synchronization)

## [1.1.0] - 2026-07-22

### Changed

- Renamed from `setup-typescript-tests-with-effect` to `effect-unit-testing`
- Removed specific version table, kept generic guidance
- Added `typescript-unit-testing` as dependency
- Changed groups to `effect`, `testing`

## [1.0.1] - 2026-07-09

### Added

- Added `executing-skills` as required dependency in frontmatter
- Added prerequisite alert after "When To Use" referencing executing-skills

## [1.0.0] - 2026-07-08

### Added

- Initial release of setup-typescript-tests-with-effect
- Scaffolds Vitest + @effect/vitest testing infrastructure for Effect v4 monorepo packages
