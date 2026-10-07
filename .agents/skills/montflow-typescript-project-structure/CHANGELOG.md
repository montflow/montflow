# Changelog

## [3.0.0] - 2026-10-07

### Changed

- Repurposed `typescript-conventions` in place as the canonical structure
  entry point `montflow-typescript-project-structure`; `id` unchanged
- Body rewritten around the module law: principles with an owner skill named
  for each concrete rule, plus `# When To Use` / `# Pipeline` / `# Reference`
- Dependencies re-scoped to the structural, Effect, and inference owners;
  design/cleanup lenses referenced instead of declared
- Added `mimicking-conventions` as a dependency and pre-write pipeline step

### Removed

- `typescript-result-over-throws` from the dependency set (unreferenced)
- The static per-category index tables

### Added

- Reference pointers for the resolved decisions and the naming vocabulary, each naming its owning skill
- `utils` added to the observed group registry

## [1.2.1] - 2026-08-28

### Changed

- @montflow/ prefix dropped from name; matches directory

## [1.2.0] - 2026-07-28

### Changed

- Renamed skill to @montflow/typescript-conventions; moved into montflow-style group folder
- Sibling skill links shortened (same folder now)

### Removed

- Ghost entry `scoping-features` — the referenced skill does not exist

## [1.1.0] - 2026-07-24
