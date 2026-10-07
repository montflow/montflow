# Memory

## Context

Task C005: `release.yml` is deliberately kept as is (B001 decision 6); confirm
the new workflow does not touch it and document the boundary.

## Progress

- 2026-10-07: complete.

## Findings

- `git diff HEAD -- .github/workflows/release.yml` is empty: untouched.
- `git status --short .github/workflows/release.yml` shows no change.
- `.github/workflows/` now contains `release.yml` (unchanged) and `verify.yml`
  (new).
- The boundary is documented in `verify.yml`'s header comment: `release.yml`
  checks are per-publish-candidate conditions and gate publishing; `verify.yml`
  gates pushes.
- No duplicated work: `release.yml` still runs its per-package checks only for
  packages about to be published (and skips when none), while `verify.yml` runs
  the repo-wide gate on every push to `main`. Neither runs the other's checks
  twice for the common case.

## Open Questions

- None.

## Handoff

- Feeds C006 document-verification.

## Deviations

- None.
