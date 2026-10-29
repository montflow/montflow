# Memory

## Context

Task A001: add `--require-complete` so CI can gate a change on the specs it
names. Contract: SPEC.md requirements 1–4.

## Progress

- 2026-10-28: complete. Specs suite 478 tests green; lint/format/typecheck clean.

## Findings

### 1. Check engine

- `CheckOptions.requireComplete?: boolean`; `completionIssue(snapshot)` returns
  one error when `SPEC.md` status is not `complete`:
  `Spec '<name>' is not complete (status: '<status>'); finish it or drop the 'Spec: <name>' trailer.`
  An unreadable file reports `status: 'unreadable'`; tree findings are kept.
- The finding is appended in `check`'s per-spec map, so `reduceCheck`, rendering,
  `--strict`, and the exit code need no change.

### 2. CLI and slash

- `check` gains `--require-complete` (default false), composed with `--name`,
  `--strict`, `--concurrency`.
- The slash form parses `--require-complete` and threads it into the same
  options.

### 3. Tests

- `check.test.ts`: an in-progress spec passes without the flag and fails with
  it (exact message); a fully complete spec (status complete, phase A locked,
  rows complete) passes; the slash form fails with the completion message.
- The complete fixture overrides the table rows to `complete`, because the
  default rows are pending and the table agreement check runs first.

## Open Questions

- None.

## Handoff

- A002 wires the CI job and docs; nothing else depends on this task.

## Deviations

- None.
