# Memory

## Context

B099 runs the phase-B adversarial review against B001/B002. Independent
`effect-reviewer` subagents; series `cli-version-awareness-b`.

## Progress

- Round 001: 17 findings (2 Major, 11 Minor, 4 Nit). Fixed; F10 marked
  `Won't Fix` (atomic rename is the portable guarantee; last-writer-wins can
  only cost an extra probe).
- Round 002: 14 resolved; F8/F13 reopened; 10 new findings (F18–F27).
  All addressed.
- Round 003: 9 of 12 carried findings resolved; 3 reopened (F21, F22, F23) and
  6 new (F28–F33). All addressed post-round, but the phase cap is three review
  rounds, so no round 004 verified them. They remain `In Review` in the ledger.
- Phase B closed with 9 resolved in round 003 plus 9 `In Review` (F21, F22,
  F23, F28–F33).

## Open Questions

- None for the phase. The remaining `In Review` findings are fixed and tested
  (cache-key dimensions, version-derived assertions, ancestry caps, diverged
  notice, stamp key, guide/help, remote key, `Match` classification); only a
  reviewer confirmation is missing per the cap.

## Handoff

- Phase C/D read `guides/updating.md` (created here) and `version --check`.
- A `diverged` verdict now exits 1 and prints a notice with `has diverged from`.

## Deviations

- No round 004, per the three-round cap. Round-003 findings were fixed and
  recorded rather than dropped.
