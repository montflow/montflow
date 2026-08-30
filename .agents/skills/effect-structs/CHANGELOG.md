# Changelog

## [3.0.2] - 2026-08-28

### Changed

- @montflow/ prefix dropped from name; matches directory

## [3.0.1] - 2026-07-28

### Added

- Added `effect` group to frontmatter groups

## [3.0.0] - 2026-07-28

### Changed

- Renamed skill to @montflow/effect-structs — structs are built on Effect Brand/Schema

## [2.0.0] - 2026-07-28

### Changed

- Renamed skill to @montflow/effect-structs; moved into montflow-style group folder
- Breaking: struct module file renamed to `[name].structs.module.ts` (`structs` group infix per @montflow/typescript-modules)
- Aligned with @montflow/typescript-modules: required `CONTEXT.md`, `tests/` folder, full `.ts` extensions in import paths

### Removed

- Dropped old `[name].struct.module.ts` naming and `.js` import extension convention

## [1.1.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter

## [1.0.1] - 2026-07-09

### Added

- Added `executing-skills` as required dependency in frontmatter
- Added prerequisite alert after "When To Use" referencing executing-skills

## [1.0.0] - 2026-07-08

### Added

- Initial release of creating-typescript-structs skill
- Branded struct scaffolding pipeline
- Templates for string brand, number brand, and composed brand patterns
- Example implementations as `.md` files with code blocks (DocumentId, Uuid, Int, PositiveInt)
- GATES.md with validation checklist
- Reference tables for required exports, optional utilities, and conventions
