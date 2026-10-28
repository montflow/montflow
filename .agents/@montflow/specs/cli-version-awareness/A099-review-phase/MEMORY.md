# Memory

## Context

A099 runs the phase-A adversarial review against A001/A002. Reviews are
independent subagents (no implementer context, no MEMORY files) bound to the
`effect-reviewer` profile. Series: `cli-version-awareness-a`.

## Progress

- Round 001: 14 findings (1 Critical, 1 Major, 6 Minor, 6 Nit). All addressed.
- Round 002: 12 of 14 resolved; F8/F14 reopened; 8 new findings (F15–F22).
  All ten In-Review findings addressed.
- Round 003: all 10 carried findings resolved; 4 new findings (F23–F26) opened.
- Post-cap fix: F23–F26 fixed and tested, but the phase cap is three review
  rounds, so no round 004 verified them. They remain `In Review` in the ledger.
- Phase A closed with 10 resolved and 4 `In Review` (F23–F26).

## Open Questions

- None for the phase. F23–F26 are fixed in code and covered by tests; only the
  reviewer's confirmation is missing, per the three-round cap.

## Handoff

- Phase B starts from `@montflow/version` at commit after this task. The update
  check should reuse `BuildInfo.describe`/`Cli.run` and expect the sanitised
  git probe environment added for F17/F23.
- If a later phase touches the store renderer, note that `StoreState` now has
  `absent`, `unmanaged`, `corrupt`, `unreadable`, `unsupported`, `managed`, and
  `Match.exhaustive` will force handling any new variant.

## Deviations

- No round 004: the user's cap is three fix → re-review rounds per phase. The
  four round-003 findings were fixed anyway and recorded as unverified rather
  than silently dropped.
- Unrelated working-tree changes (`installation-guide` spec, `opencode.jsonc`)
  appeared during the phase; they were left untouched and excluded from every
  commit.
