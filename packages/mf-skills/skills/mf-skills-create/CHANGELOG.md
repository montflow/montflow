# Changelog

## [1.2.1] - 2026-11-24

### Changed

- A diverged skill also stops sync from overwriting it: `mf-skills sync` leaves a target skill carrying `metadata.diverged: true` alone and reports it `Skipped (diverged)`.

## [1.2.0] - 2026-11-23

### Added

- A montflow skill can diverge from the standard with `metadata.diverged: true`: `mf-skills verify` reports `✓ diverged` and skips the standard checks, and the interactive menu hides `Transform to standard`.

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
