# Changelog

## [2.0.0] - 2026-10-06

### Changed

- The skill now authors the spec directly (`SPEC.md` plus one directory per task) from its own rules
- Dropped the `mf-specs create` / `mf-runs` dispatch pipeline, the model and effort inputs, and the run-id handoff

## [1.0.0] - 2026-10-06

### Added

- Initial release of montflow-create-pi-specs
- Collecting the three dispatch inputs (prompt, model, effort) and reporting the run id
- `mf-specs doctor` install path into `.agents/skills/`
