# Memory

## Context

Task B006: parent/related runs + completion notification (user request after
B099 review, to enable fix-subrun orchestration).

## Progress

- 2026-09-23: complete.

## Done

- `Run.related?: ReadonlyArray<Id>`; `Store.CreateArgs.related`; `withExtras`
  preserves `related`.
- `RunnerStartInput.parent` / `.related` persisted at create.
- `SessionPort.followUp` added; Pi factory wires `session.followUp`.
- `settle` notifies a live parent via `followUp` before the host `onSettled`.
- `start` now returns the running run (also fixes review F9).
- Tests: child→parent notification, related persistence, running return.

## Gates

- `format:check`, `lint:check`, `ts:check`, `test` all pass (60 tests).

## Open Questions

- Orchestration strategy for the fix subruns (grouping to avoid file conflicts).

## Handoff

- Scheduler script can now dispatch one subrun per fix task with a parent.

## Deviations

- None.
