# Changelog

## [3.0.0] - 2026-10-28

### Changed

- **Breaking:** a spec is `SPEC.md` plus one directory per phase, each holding one directory per task (`<spec>/<PHASE>/<PHASE><NNN>-<name>/`); a task id's letters must match its phase directory
- The strict per-level allowlist: root = `SPEC.md` + phase dirs, phase = task dirs, task = `TASK.md`/`MEMORY.md`/`GATES.md`; an empty phase directory or a stray file/directory fails
- `mf-specs create` writes the nested layout; `create` still scaffolds phase A only

### Added

- `mf-specs migrate --name <spec>` / `--all` (with `--dry-run`) moves a flat spec under its phases without editing a file

## [2.3.0] - 2026-10-25

### Changed

- The slash-command form is `/specs create` in the OpenCode host; `mf-specs create` is the binary

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
- Dropped the `mf-specs create` dispatch pipeline, the model and effort inputs, and the session-id handoff

## [1.0.0] - 2026-10-06

### Added

- Initial release of montflow-create-pi-specs
- Collecting the three dispatch inputs (prompt, model, effort) and reporting the session id
- `mf-specs doctor` install path into `.agents/skills/`
