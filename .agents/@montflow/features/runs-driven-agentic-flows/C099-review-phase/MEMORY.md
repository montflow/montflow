# Memory

## Context

Task C099: independent adversarial review of Phase C, dogfooded through the run
engine.

## Progress

- 2026-09-23: complete. Reviewer run `review-phase-c` dispatched via
  `Runner.start` (script `packages/pi-runs/tmp/review-phase-c.ts`); report at
  `.agents/@montflow/reviews/runs-driven-agentic-flows/C.md`. Run settled `done`.

## Outcome

**2 Critical, 6 Major, 10 Minor, 4 Nit (22 total).** Remediated by the
`fix-surfaces` + `fix-verify-c` subruns, then a manual close-out of the last
two open findings.

Final disposition: **21 resolved, 1 deferred (F6 → E001)**, all gates green
(133 tests).

- F1–F5, F7–F22 resolved (CLI argv parsing, fire-and-forget tool start, bin
  linkage, per-cwd runner host, resume/interrupt verbs, per-run bridge context,
  runtime disposal, notify/ask routed through the run queue).
- **F6 deferred to E001** by contract: the engine exposes the `onSettled` seam;
  the profile-create flow owns invoking `/mf-profiles-cli create`. A004 decision
  5 and the surface tool names were reconciled.

## Open Questions

- None; F6 is tracked by E001.

## Handoff

- Phase C closed; Phase D (workspace integration) can start. F6 remains with E001.

## Deviations

- None.
