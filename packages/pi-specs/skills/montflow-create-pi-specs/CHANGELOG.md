# Changelog

## [2.2.0] - 2026-10-15

### Added

- `reviewer-profiles` on the `review` task: the field, its `<spec>-<profile>` series, and the `effect-reviewer` binding for code phases (any phase holding an `execution` or `defect` task)
- `--reviewer-profiles` in the scaffold command and reference

## [2.1.0] - 2026-10-13

### Added

- `mf-specs create` scaffold step: the skill now scaffolds a valid tree with the deterministic, model-free CLI before filling it in

### Changed

- Self-check now runs `mf-specs check --name <spec>`

## [2.0.0] - 2026-10-06

### Changed

- The skill now authors the spec directly (`SPEC.md` plus one directory per task) from its own rules
- Dropped the `mf-specs create` / `mf-sessions` dispatch pipeline, the model and effort inputs, and the session-id handoff

## [1.0.0] - 2026-10-06

### Added

- Initial release of montflow-create-pi-specs
- Collecting the three dispatch inputs (prompt, model, effort) and reporting the session id
- `mf-specs doctor` install path into `.agents/skills/`
