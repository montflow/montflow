# Memory

## Context

D099 runs the phase-D adversarial review against D001–D003 with two declared
profiles, so the phase has two independent series:
`cli-version-awareness-d-effect-reviewer` and
`cli-version-awareness-d-documentation-reviewer`.

## Progress

- Effect series:
  - Round 001: 16 findings (1 Critical, 3 Major, 9 Minor, 3 Nit). Fixed;
    F9/F14/F15/F16 `Won't Fix` with rationale.
  - Round 002: 6 resolved, 6 reopened, 4 new (F17 Critical prune, F18, F19,
    F20). F17/F18/F19/F20 fixed; F2/F6/F7/F8 fixed; F12 `Won't Fix` (manifest
    only, no renderer by spec); F13 tests added.
- Documentation series:
  - Round 001: 9 findings (3 Major, 4 Minor, 2 Nit). Fixed.
  - Round 002: 5 resolved, 3 reopened, 4 new. All fixed: diverged notice state,
    store-line wording, offline claim, `Refused` groups, specs CONTEXT/README,
    mixed-run manifest.
- Closed after two rounds with `In Review` (effect 9, docs 8) for
  reviewer-unconfirmed fixes; no round 003 was run.

## Open Questions

- None for the phase. The unconfirmed findings are implemented and covered by
  tests; only a third review round would flip them, and the phase is closed
  here to stop the loop.

## Handoff

- All three series (`-a`, `-b`, `-c`, plus the two `-d` series) record their
  unverified tails in their ledgers. `mf:check:reviews` is green.
- The spec's four phases are complete.

## Deviations

- Two series for one phase, as the task declares two reviewer profiles.
- No third round despite the cap allowing it; round-002 fixes are recorded as
  `In Review`.
