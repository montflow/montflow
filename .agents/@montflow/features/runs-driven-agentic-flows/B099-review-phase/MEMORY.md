# Memory

## Context

Task B099: independent adversarial review of Phase B, dogfooded through the
run engine itself.

## Progress

- 2026-09-23: complete. Reviewer run dispatched via `Runner.start` (script
  `packages/pi-runs/tmp/review-run.ts`); report at
  `.agents/@montflow/reviews/runs-driven-agentic-flows/B.md`.

## Outcome

Reviewer verdict: **1 Critical, 9 Major, 7 Minor, 2 Nit (19 open)**.

Dogfooding surfaced a real blocking bug the review classed as a risk (F14):
the Pi session factory ran runner effects with `Effect.runPromise` from Pi's
synchronous event callback, i.e. on the default runtime, deadlocking
`Store.settle` (no receipt, run stuck `running`). Fixed by making
`SessionPort.subscribe` a synchronous listener that offers into a
`Queue<SessionEvent>` consumed on the runner's runtime (`Stream.fromQueue` +
`runForEach`). That also fixes F5 (pre-subscription `ActiveRun`) and F14
(event ordering). Verified with a clean real run (`settle-probe`: `done`
receipt written).

## Findings to remediate

- All 19 findings (F1–F19) resolved via B007 (F1–F7, F9, F11–F19),
  B008 (F8), and B009 (F10). Review file B.md updated: Resolved 19 / Open 0.
  Gates: 99 tests pass; format/lint/ts clean.

## Open Questions

- None.

## Handoff

- Author defect/execution tasks per accepted finding before Phase C.

## Deviations

- Review ran before remediation, so several findings target pre-fix code
  (F5, F14 already resolved by the queue refactor).
