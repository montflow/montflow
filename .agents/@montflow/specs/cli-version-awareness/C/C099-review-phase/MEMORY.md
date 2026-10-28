# Memory

## Context

C099 runs the phase-C adversarial review against C001/C002. Independent
`effect-reviewer` subagents; series `cli-version-awareness-c`.

## Progress

- Round 001: 7 findings (3 Major, 3 Minor, 1 Nit). Fixed; F5 `Won't Fix`
  (changesets has one global `privatePackages.tag`; extra tags are private
  tooling, never published).
- Round 002: 5 resolved, F6 reopened, 4 new (F8–F11). Fixed.
- Round 003: F6/F8/F9/F11 resolved; F10 reopened; F12/F13 new. Fixed post-round.
- Phase C closed with 4 resolved in round 003 and 3 `In Review` (F10, F12,
  F13) because the three-round cap forbids a fourth review.

## Open Questions

- None for the phase. F10/F12/F13 are fixed and covered by spawned tests; only
  reviewer confirmation is missing per the cap.

## Handoff

- D003 reuses `mf:check:release` for the guide-anchor check and `guides/updating.md`.
- The release guard now also enforces one fixed group, manifest names, and
  private flags.

## Deviations

- No round 004, per the three-round cap.
