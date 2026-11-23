# Changelog

## [1.1.0] - 2026-11-23

### Changed

- Renamed from `setup-agents` to `mf-setup-agents-md`: every skill montflow authors carries the `mf-` prefix

## [1.0.0] - 2026-08-30

### Added

- Initial release of setup-agents skill
- Minimal AGENTS.md template: language, package manager, commands, skills location
- Pipeline: detect facts from repo → compress via caveman-compression → write → verify
- Deletes non-template content from existing AGENTS.md (indexes, entry points, conventions essays)
