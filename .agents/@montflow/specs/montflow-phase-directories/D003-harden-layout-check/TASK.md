---
id: D003
name: harden-layout-check
type: execution
originator: planner:C099
depends-on: D002
related-tasks:
status: complete
---

# Task D003: harden layout check

## Type: execution

## Description

With every tree migrated, delete the legacy tolerance so a task directory at the
spec root is an error again. This is the one edit that makes the layout strict
rather than advisory, and it is deliberately a separate task from C002.

## Requirements

- Delete the flat-task-directory warning branch in `verifySpecTree` and emit the
  placement error with the same target-path message and `fix`; leave the rest of
  the verifier byte-identical.
- Update the structure tests: the legacy case now expects an error; delete the
  `mock-legacy` fixture's clean-warning assertion and either remove the fixture
  or keep it as an error fixture named for that purpose; update the fixtures
  README counts.
- Confirm `--strict` is no longer needed for this class of finding, and that no
  other finding regressed from error to warning.
- Confirm the six migrated specs and the migrated fixtures still verify clean,
  and that a hand-made flat tree fails.
- Do not edit `PHASE.md`-related behavior; that file does not exist in this
  spec's layout and belongs to `montflow-spec-standard/C001`.

## Completion

- [x] A task directory at the spec root fails with the placement error
- [x] `bun run --cwd packages/specs test` passes with no warning-only layout case left
- [x] `bun run mf:check:specs` reports zero issues and zero warnings
- [x] No other finding's severity changed
