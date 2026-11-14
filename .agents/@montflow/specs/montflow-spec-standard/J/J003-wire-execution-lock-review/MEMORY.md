# Memory

## Context

J003 wires verification mode (light/full, J002 `Resolved.verification` /
`TaskTarget.verification`) into execution proof, locks, and review.
Consumed J001 decision (light: task gate only, locks on task gates alone,
`review decide` -> `waived`; full: unchanged) and J002 resolution
(`inherit` -> `light`, per-task mode) read-only.

## Progress

- Coded light/full through review-policy, phase, lifecycle, and every
  lock/review caller; pinned behavior with colocated tests.

## Findings

- verification: light · model: opencode-go/crouton-alpha-free#max
- `review-policy`: `decide` returns `waived` / `verification.light` for
  `verification: light`; `full`/absent follows the normal order. Verdict
  passes for light without a round.
- `phase.phaseEvidence(snapshot, verifications)`: light phases prove on
  task gates alone (phase-gate pass not required); `light` set feeds the
  lock. `phaseVerification`: light iff every non-review task is light;
  `review` tasks never decide the phase mode. Audit helpers
  `renderVerificationAudit` / `parseVerificationAudit` canonicalize
  `verification: light · model: provider/model#effort`.
- `lifecycle`: `Input.lightPhases` locks complete+proven like waived/none.
- Wired `cli.review`/`status`/`check`/`state`/`claim` + `structure` via
  `taskVerifications` and `review/verifications`; `lock` bypasses review
  blockers for light; phase-gate provenance is already task-only through
  `proven`. No prompt/profile edits (installed mirror sync is
  orchestrator/doctor-owned).
- Default `inherit` -> `light` now locks no-config specs without review;
  intended per J001, flagged here as the visible behavior change.

## Gates

- Scoped proof exit 0: `bun run --cwd packages/specs test -- src/modules/lifecycle src/modules/phase src/modules/review-policy` -> `Test Files 6 passed (6)` / `Tests 168 passed (168)`. Full output `/tmp/J003.log`.
- Stage 0/1 (static/behavior) are orchestrator-executed: reviewer must
  judge MEMORY.md audit lines `verification: light · model: <target>`
  appear per light task before close, full still needs a closed round,
  and no hand-counting (decisions stay read from `review decide` output).

## Open Questions

- Orchestrator to confirm installed prompt/mirror sync and whether J004
  adds verification text to the execution prompt; J003 left both
  untouched to keep lean-contract green.

## Handoff

- J004: review dispatch skip for light is `decide` -> `waived` plus the
  `lock` bypass; add prompt wording only if the orchestrator wants it.

## Deviations

- None.
