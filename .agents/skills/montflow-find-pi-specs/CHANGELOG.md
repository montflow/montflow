# Changelog

## [1.4.0] - 2026-10-28

### Changed

- Spec layout is `SPEC.md` plus one directory per phase, each holding its task directories

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
