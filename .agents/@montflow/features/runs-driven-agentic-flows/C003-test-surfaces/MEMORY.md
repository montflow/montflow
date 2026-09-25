# Memory

## Context

Task C003: surface tests.

## Progress

- 2026-09-23: complete.

## Done

- `apps/commands/tests/parse-command.test.ts`: tokenizer + every action + Help.
- `apps/commands/tests/execute.test.ts`: fake `Runner` layer; list/status/verify
  rendering and `start` settlement via `onSettled`.
- `src/tests/extension.test.ts`: `/mf-runs` + six tool names registered.
- Surfaces delegate to `execute`, so engine logic is not duplicated.

## Gates

- `format:check`, `lint:check`, `ts:check`, `test` all pass (109 tests).

## Open Questions

- None.

## Handoff

- C099 reviews Phase C.

## Deviations

- None.
