# Changelog

## [1.1.1] - 2026-11-24

### Changed

- A diverged skill also stops sync from overwriting it: `mf-skills sync` leaves a target skill carrying `metadata.diverged: true` alone and reports it `Skipped (diverged)`.

## [1.1.0] - 2026-11-23

### Added

- Documented the `metadata.diverged: true` flag: a diverged skill is exempt from the standard, `mf-skills verify` reports `✓ diverged` as a pass, and editing must preserve the flag unless intentionally changing it.

## [1.0.1] - 2026-10-22

### Changed

- Verify forms point at the OpenCode host and `packages/skills`; package names no longer say pi-skills

## [1.0.0]

### Added

- Initial release: modifies or audits an existing workspace skill while keeping
  the pi-skills schema valid, then self-checks with `mf-skills verify`.
