# Memory

## Context

Task D099: independent adversarial review of Phase D, dogfooded through the run
engine.

## Progress

- 2026-09-23: complete. Reviewer run `review-phase-d` dispatched via
  `Runner.start` (script `packages/pi-runs/tmp/review-phase-d.ts`); report at
  `.agents/@montflow/reviews/runs-driven-agentic-flows/D.md`. Run settled `done`.

## Outcome

**1 Critical, 3 Major, 6 Minor, 3 Nit (13 total).** Remediated by the
`fix-workspace` + `fix-verify-d` subruns.

Final disposition: **12 resolved, 1 partial (F10)**, all gates green
(workspace 295 tests, pi-runs 134 tests).

- F1 resolved: `DEFAULT_RUN_TOOLS = ['read','write','edit']` is forwarded by
  `startRun`; no workspace run regains `bash`.
- F2 resolved: `Runner.answer` fails when the run is not live.
- F3 resolved: live poll is silent with backoff (no per-second toasts).
- F4 resolved: workspace bridge sanitizes run-controlled text.
- F5-F9, F11-F13 resolved.
- **F10 partial:** runtime disposal interrupts detached fibers, but live Pi
  sessions are not explicitly aborted/disposed (no finalizer on the
  `Layer.succeed` factory). Tracked as hardening.

## Open Questions

- F10 hardening: add a session finalizer / explicit dispose on cleanup.

## Handoff

- Remediate before Phase E; F2/F3 may also warrant engine-side hardening.

## Deviations

- None.
