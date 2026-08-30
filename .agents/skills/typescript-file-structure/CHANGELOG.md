# Changelog

## [1.0.1] - 2026-08-28

### Changed

- @montflow/ prefix dropped from name; matches directory

## [1.0.0] - 2026-07-28

### Added

- Initial release of @montflow/typescript-file-structure skill
- Rule: tests colocated in the tested module's `tests/` folder, always named `*.test.ts`
- Rule: every folder except `src/` has an `index.ts` re-exporting all subfolder indexes (`export * from "./[subfolder]/index.ts"`)
- Distinction preserved: module-level `index.ts` stays namespace-style per @montflow/typescript-modules
- Audit pipeline: map tree → verify colocation → verify index chain → verify resolution
