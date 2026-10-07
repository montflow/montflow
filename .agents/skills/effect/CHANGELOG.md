# Changelog

## [2.0.0] - 2026-10-07

### Changed

- Renamed from `effect-v4` to `effect`; frontmatter `id` unchanged
- Refetched from upstream `kitlangton/skills@effect` (source of truth): adds `references/V4_APIS.md` and ~100 lines of reference updates
- Error model mirrors upstream: `Schema.TaggedError`

## [1.2.0] - 2026-10-07

### Changed

- Typed Effect errors now use `Data.TaggedError` (`Schema.TaggedErrorClass` mandate retired) in `SKILL.md`, `references/SCHEMA.md`, and `references/SERVICES_LAYERS.md`
- `references/SERVICES_LAYERS.md` now flags the self-export module surface as an Effect API reference, not the montflow module law

## [1.1.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter

## [1.0.0] - 2026-07-18

### Added

- Initial release of effect-v4
- Core Effect v4 guidance for building production TypeScript applications
- Reference files for Schema, Services/Layers, Config, Scheduling, Caching, HTTP Clients, Streams, and Testing
