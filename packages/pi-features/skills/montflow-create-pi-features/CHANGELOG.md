# Changelog

## [2.0.0] - 2026-10-06

### Changed

- The skill now authors the feature spec directly (`FEATURE.md` plus one directory per task) from its own rules
- Dropped the `mf-features create` / `mf-runs` dispatch pipeline, the model and effort inputs, and the run-id handoff

## [1.0.0] - 2026-10-06

### Added

- Initial release of montflow-create-pi-features
- Collecting the three dispatch inputs (prompt, model, effort) and reporting the run id
- `mf-features doctor` install path into `.agents/skills/`
