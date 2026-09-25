# Memory

## Context

Task B008: persist the tools allowlist across resume (review F8).

## Progress

- 2026-09-23: complete (dispatched as `fix-tools` subrun under `fix-coordinator`).

## Done

- `Run.tools?: ReadonlyArray<string>`; persisted via `Store.create` and
  preserved by `withExtras`.
- `Runner.start` persists `input.tools`; `Runner.resume` replays `loaded.run.tools`.
- Tests: store round-trip + runner "persists the tools allowlist and replays it
  on resume".

## Gates

- `format:check`, `lint:check`, `ts:check`, `test` all pass (99 tests total).

## Open Questions

- None.

## Handoff

- F8 closed; Phase B remediation complete.

## Deviations

- None.
