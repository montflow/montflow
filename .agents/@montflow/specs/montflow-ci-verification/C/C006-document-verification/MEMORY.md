# Memory

## Context

Task C006: document the shared scripts, extension verifies, hook install, CI
matrix, and release boundary.

## Progress

- 2026-10-07: complete.

## Findings

### `AGENTS.md`

- `## Commands` gained `verify:montflow`, `verify:montflow:fast`, and
  `hooks:install`.
- New `## Verification gate` section documents the full/fast scripts, the CI
  matrix location and trigger, the Lefthook install and bypass, the per-check
  extension scripts, and that `release.yml` gates publishing rather than pushes.

### Workflow comments

- `verify.yml`'s header documents the `release.yml` boundary and the
  push-to-main-only limitation.

### Not changed

- `README.md` is a one-line stub; no verification content belongs there.
- `release.yml` untouched (C005).

## Open Questions

- None.

## Handoff

- Feeds C007 conformance-and-changelogs.

## Deviations

- None.
