# Changelog

## [2.1.1] - 2026-08-28

### Changed

- @montflow/ prefix dropped from name; matches directory

## [2.1.0] - 2026-07-28

### Added

- Module Style section: exported methods defined as arrow-function consts (`export const name = () => {}`)
- No-Echo Rule: function names avoid repeating the module name (`login` not `authLogin`) — strong suggestion, not hard rule

## [2.0.0] - 2026-07-28

### Changed

- Renamed skill to @montflow/typescript-modules; moved to montflow-style group folder
- Breaking: modules must live inside a group folder (`modules/`, `utils/`, `services/`, `layers/`) — loose modules are no longer allowed
- Breaking: module file named `[module-name].[group].module.ts`; exception: group `modules` uses `[module-name].module.ts`
- Breaking: import/export paths now include the full `.ts` extension (was `.js`)

### Added

- Required `CONTEXT.md` per module
- Required `tests/` folder with `[module-util-name].test.ts` naming
- Declared upcoming dependency on `@montflow/effect-testing`

## [1.1.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter

## [1.0.1] - 2026-07-09

### Added

- Added `executing-skills` as required dependency in frontmatter
- Added prerequisite alert after "When To Use" referencing executing-skills

## [1.0.0] - 2026-07-08

### Added

- Initial release of creating-typescript-modules skill
- Module scaffolding pipeline: create directory, module file, index file, usage
- Namespace-style re-export pattern (`export * as Name from`)
- `.module.ts` convention for tree-shakable modules