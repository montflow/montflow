# Changelog

## [1.5.0] - 2026-10-26

### Added

- Branch resolution with `mf-specs which` / `/specs which`: the `<prefix>/<feature-name>` grammar, exact-then-prefix matching, and the ask-the-user rule on a miss
- Begin-or-resume handoff through `mf-specs execute` / `/specs execute` and the `spec-execute` prompt, including `guided` (default) and `autonomous`

### Changed

- The reference names the shipped `spec-execute` prompt and the `which` / `execute` engines instead of only the listing path

## [1.4.0] - 2026-10-26

### Changed

- Renamed from `montflow-find-pi-specs` to `montflow-find-specs`; the creation cross-reference names `montflow-create-specs`

## [1.3.0] - 2026-10-25

### Changed

- The slash-command form is `/specs list` in the OpenCode host; `mf-specs list` is the binary
- Package paths point at `packages/specs`

## [1.2.0] - 2026-10-13

### Added

- Pointer to `mf-specs create` for scaffolding a new spec skeleton

## [1.1.0] - 2026-10-07

### Changed

- Renamed the `mf-specs discover` command to `mf-specs list` (same `--pending` / `--status` filters).

## [1.0.0] - 2026-10-06

### Added

- Initial release of montflow-find-pi-specs
- `mf-specs discover` pipeline with `--pending` / `--status` filters
- `mf-specs doctor` install path into `.agents/skills/`
