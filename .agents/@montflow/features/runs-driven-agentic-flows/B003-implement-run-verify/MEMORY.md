# Memory

## Context

Task B003: mechanical run verification (user requirement).

## Progress

- 2026-09-21: complete.

## Done

- `modules/verify`: pure `verifyRun({ id, runMd, session, receipt })` →
  `{ valid, resumable, issues }`, mirroring the profile/feature verifiers.
- Checks: descriptor decodes + id matches dir; `seq` 1-based and monotonic;
  receipt presence matches terminal status; outcome matches status.
- `resumable` = valid + not terminal + no receipt + running/awaiting-input +
  `Replay.canReplay`.
- `Store.verify(id)` reads raw files and calls it.
- `Runner.resume` refuses invalid runs with the field-scoped issue list, and
  refuses non-resumable runs.
- Tests: 6 verify failure classes + 2 Store.verify integration.

## Gates

- `format:check`, `lint:check`, `ts:check`, `test` all pass (56 tests).

## Open Questions

- None.

## Handoff

- C002 exposes `mf-runs verify`; D002 refuses to resume invalid runs.

## Deviations

- None.
