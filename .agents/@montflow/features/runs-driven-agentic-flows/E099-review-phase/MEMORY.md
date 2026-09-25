# Memory

## Context

Task E099: independent adversarial review of Phase E, dogfooded through the run
engine.

## Progress

- 2026-09-23: complete. Reviewer run `review-phase-e` dispatched via
  `Runner.start` (script `packages/pi-runs/tmp/review-phase-e.ts`); report at
  `.agents/@montflow/reviews/runs-driven-agentic-flows/E.md`. Run settled `done`.

## Outcome

**0 Critical, 4 Major, 6 Minor, 2 Nit (12 total).** Remediated by the
`fix-phase-e` + `fix-verify-e` subruns.

Final disposition: **11 resolved, 1 partial (F4)**, all gates green
(workspace 322 tests, pi-runs 137 tests).

- F1 resolved at the engine boundary: `withInteractionTools` unions
  `ask_user`/`notify_user` into the allowlist, so a restricted tool set can no
  longer disable them.
- F2 resolved: completion correlates via the run's final assistant reply.
- F3 resolved by contract amendment: `authorCompletion` persists through
  `saveProfile` (decode+encode); A004 decision 5 amended.
- F5-F12 resolved.
- **F4 partial:** `resume` now forwards `onSettled`, but no TUI path re-supplies
  `authorCompletion` after an app restart; durable completion is deferred.

## Open Questions

- F4 hardening: persisted completion marker or TUI auto-resume path.

## Handoff

- Remediate before closing the feature; F1 is required for ask/answer to work.

## Deviations

- None.
