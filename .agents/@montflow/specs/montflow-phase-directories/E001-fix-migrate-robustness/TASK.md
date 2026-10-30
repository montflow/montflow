---
id: E001
name: fix-migrate-robustness
type: defect
originator: defect:C099
depends-on: D004
related-tasks: C003
status: complete
---

# Task E001: fix migrate robustness

## Type: defect

## Description

Address the migrate findings from rounds 002–004: an empty phase tree reported
as "already migrated" and never verified, silent half-migration of an
unparsable root directory, and no rollback when a rename fails.

## Requirements

- `planMigration` refuses an unparsable task-looking root directory with
  `Spec '<name>' has an unparsable task directory '<dir>'; expected …` before
  any move.
- `already` is reported only when the snapshot verifies; otherwise the spec is
  `failed` with the verifier's findings and a non-zero exit.
- Apply moves sequentially; on the first failure, reverse every applied move and
  report `Migration rolled back: <reason>` with no moves counted as migrated.
- Tests: unparsable refusal, already-but-invalid, unknown spec, rollback, and the
  slash form.

## Completion

- [x] The five tests pass in `migrate.test.ts`.
- [x] `bun run --cwd packages/specs test` passes.
