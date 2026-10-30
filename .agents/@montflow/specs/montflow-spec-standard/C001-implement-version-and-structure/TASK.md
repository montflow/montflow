---
id: C001
name: implement-version-and-structure
type: execution
originator: planner:B002
size: medium
depends-on: B002
related-tasks: A003
status: pending
---

# Task C001: implement version and structure

## Type: execution

## Description

Land the version field with its warn-below and error-above rule, and the v2 tree where a
phase is a real directory holding its own contract, gate, memory, and board.
Accept the current and previous standard so nothing is stranded.

## Requirements

- `SPEC.md` carries the version field; absent reads as the previous standard and warns, above current errors, and the verifier accepts current and previous.
- New phase module: `PHASE.md` parse and verify, phase ids no longer derived from a task-id prefix, phase status and lock derived rather than stored.
- Tasks move under their phase with numbering restarting per phase; ids stay flat, unique, and sortable.
- The reserved review task id and its per-phase structure check are deleted; review becomes a `PHASE.md` field, required or waived with a reason.
- The hand-written lock list and the contradiction state that policed it are removed, with their checks and tests retired in the same change.
- Every surviving rule still passes against a v1 fixture, and a v2 fixture is added beside it.

## Completion

- [ ] A v1 fixture and a v2 fixture both verify; the v1 fixture warns about its version and a future-version fixture errors
- [ ] `bun run --cwd packages/pi-specs test` passes including new phase-module tests
- [ ] `bun run verify:montflow:specs` reports zero issues for both existing specs, with version warnings only
- [ ] `ts:check`, `lint:check`, and `format:check` pass
