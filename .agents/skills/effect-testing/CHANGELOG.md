# Changelog

## [2.0.2] - 2026-08-28

### Changed

- @montflow/ prefix dropped from name; matches directory

## [2.0.1] - 2026-07-28

### Added

- Added `effect` group to frontmatter groups

## [2.0.0] - 2026-07-28

### Changed

- Renamed skill to @montflow/effect-testing — it is Effect-specific (@effect/vitest mandatory, Effect runtime patterns)

## [1.4.0] - 2026-07-28

### Added

- Merged in effect-unit-testing skill (now deleted): Effect test runners (`it.effect`/`it.live`/`it.scoped` via namespace import), test layers, `TestClock`, config overrides, fiber synchronization primitives
- Version pinning rule: when the package depends on `effect`, `@effect/vitest` must match exactly (no caret)

## [1.3.0] - 2026-07-28

### Added

- Absorbed test-quality fundamentals inline (probe assertions, mock-testing anti-pattern, specificity, independence/repeatability/coverage)

### Removed

- Dependency on deleted `unit-testing` skill

## [1.2.1] - 2026-07-28

### Changed

- Install step is package-manager agnostic — detect from lockfile instead of assuming pnpm

## [1.2.0] - 2026-07-28

### Added

- Author separation rule: the agent writing tests must not have implemented the utility; if it has, stop and ask the user before proceeding

## [1.1.0] - 2026-07-28

### Added

- `@effect/vitest` is now the mandatory test library (with peer `vitest` installed); pipeline step verifies installation
- Package `test` script must include type testing: `vitest run --typecheck`
- Vitest config guidance: `typecheck.include` must cover `src/**/*.test.ts` so `types` suites are checked
- `types` suite guidance: `Vitest.expectTypeOf(...)` for positive assertions, `@ts-expect-error` for negative ones

### Changed

- Removed "any testing lib" option — bare `vitest`, `node:test`, etc. no longer allowed

## [1.0.0] - 2026-07-28

### Added

- Initial release of @montflow/effect-testing skill
- Fixed test location: `tests/` inside the same module (per @montflow/typescript-modules)
- Namespace imports: test library (`import * as Vitest from ...`) and module under test (`import * as ModuleName from "../index.ts"`)
- Max two suites per file — `types` (optional) then `runtime`
- Fully qualified suite naming: `"ModuleName.utilityName runtime"`
- Quality gates inherited from unit-testing
