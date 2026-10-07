# Changelog

## [3.0.0] - 2026-10-07

### Changed

- Renamed from `writting-jsdoc` to `writing-jsdoc` (typo fix); frontmatter `id` unchanged

## [2.0.0] - 2026-10-07

### Changed

- JSDoc is now explicitly not required; the skill is ultra-minimal and opt-in
- Free-form one-line comments are canonical; `@description` is documented as unused in this repo
- `@param` / `@returns` / `@throws` are emitted only when the name or unit is non-obvious

## [1.1.1] - 2026-08-06

### Changed

- Removed type information from JSDoc templates (`@throws ErrorType` → `@throws`)
- Strengthened core rule to forbid all type info in annotations (`{Type}` braces, error class names, return types, property types)

## [1.1.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter
