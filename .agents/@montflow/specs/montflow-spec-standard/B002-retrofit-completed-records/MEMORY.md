# Memory

## Context

The store's completed records do not confirm their own status: 135 unchecked
completion items and 78 all-unchecked gates across the historical specs. Both
checks are warnings today, which hides the contradiction. This task makes them
errors and repairs every completed record, using `size: none` for completed
tasks that have no real size.

## Progress

- 2026-11-02: pending, planned. Runs after B001 restores the phase tree and
  accepts `size: none`.

## Findings

- `task.completion-unchecked` and `gate.unchecked` are warnings in
  `packages/specs/src/modules/task/task.module.ts` and
  `packages/specs/src/modules/gates/gates.module.ts`.
- The historical warning split at planning time: 182 missing size, 135 unchecked
  completion, 78 unchecked gate. The retrofit records the final counts.
- Some completed tasks have no gate file, which is not a `gate.unchecked`
  finding; only a gate with items and no checked item is.

## Open Questions

- An item that cannot be evidenced reopens the task rather than being ticked.
  The reopen is recorded in the task `MEMORY.md`; no new status is invented.

## Handoff

- B001 must accept `size: none` before this task runs; the reverse order would
  force a size onto historical tasks.

## Deviations

- None yet.
