# Changelog

## [3.0.0] - 2026-10-07

### Changed

- Renamed from `typescript-file-structure` to `montflow-typescript-file-structure`; frontmatter `id` unchanged

## [2.0.0] - 2026-10-07

### Changed

- Re-export specifiers now use the `.js` extension
- `src/index.ts` is now the documented package/service entry carve-out (the only loose file under `src/`)
- `layers` dropped from the group examples; plural group folders are open-ended

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
