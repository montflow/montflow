# Changelog

## [2.0.2] - 2026-08-28

### Changed

- @montflow/ prefix dropped from name; matches directory

## [2.0.1] - 2026-07-28

### Added

- Added `effect` group to frontmatter groups

## [2.0.0] - 2026-07-28

### Changed

- Renamed skill to @montflow/effect-services; moved into montflow-style group folder
- Breaking: service module file renamed to `[service-name].services.module.ts` (`services` group infix per @montflow/typescript-modules)
- Aligned with @montflow/typescript-modules: required `CONTEXT.md`, `tests/` folder, full `.ts` extensions in import paths
- Now depends only on executing-skills and @montflow/typescript-modules

### Removed

- Dropped old `[service-name].module.ts` naming and `.js` import extension convention

## [1.1.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter

## [1.0.1] - 2026-07-09

### Added

- Added `executing-skills` as required dependency in frontmatter
- Added prerequisite alert after "When To Use" referencing executing-skills

## [1.0.0] - 2026-07-08

### Added

- Initial release of creating-effect-services skill
- Effect v4 service scaffolding pipeline
- ServiceMap.Service pattern with required exports (Id, Impl, ServiceName, Default)
- make effect and Default layer patterns

### Changed

- Added `dependencies` frontmatter field referencing creating-typescript-modules
- Removed `license` field from frontmatter to align with template
- Extracted inline Service Template to `templates/service.module.ts`
- Extracted inline Full Example to `examples/json.service.ts`
- Updated Reference section links to point to new files
- Updated Directory Structure to document skill layout