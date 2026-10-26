# Changelog

## [1.2.0] - 2026-10-26

### Changed

- Renamed from `montflow-create-pi-skills` to `montflow-create-skills`; the retired Pi infix is gone from the directory, the frontmatter `name`, and every cross-reference

## [1.1.1] - 2026-10-22

### Changed

- Namespacing rule names `@montflow/*` plugins; the verify forms point at the OpenCode host and `packages/skills`

## [1.1.0]

### Added

- Extension-owned skills are namespaced: a skill shipped by a `montflow/pi-*`
  extension must be prefixed `montflow-`.

## [1.0.0]

### Added

- Initial release: authors a workspace skill under `.agents/skills/<name>/`
  from the pi-skills contract, then self-checks with `mf-skills verify`.
