---
id: C001
name: implement-version-and-structure
type: execution
originator: planner:B004
size: medium
depends-on: B004
related-tasks: B001, A003
status: pending
---

# Task C001: implement version and structure

## Type: execution

## Description

Land the version field with its warn-below and error-above rule, and the `PHASE.md`
contract on top of the phase tree and derived locks B001 already restored. Accept
the current and previous standard so nothing is stranded.

## Requirements

- `SPEC.md` carries the version field; absent reads as the previous standard and warns, above current errors, and the verifier accepts current and previous.
- New phase module: `PHASE.md` parse and verify (objective, status, review required-or-waived with reason, gate kind), written into the phase directory B001 restored. Phase ids stay the directory name, never a task-id prefix.
- Phase status and lock stay derived as B001 landed them; `PHASE.md` adds the review decision and gate expectation, it does not reintroduce a stored lock list.
- Confirm B001's delete list stays deleted: the reserved review task id, its per-phase structure check, and the hand-written lock list are absent, with their checks and tests retired.
- Every surviving rule still passes against a v1 fixture, and a v2 fixture is added beside it.
- `migrate` upgrades B001's phase tree to the v2 `PHASE.md` shape; a version bump without that transformation is rejected.

## Completion

- [ ] A v1 fixture and a v2 fixture both verify; the v1 fixture warns about its version and a future-version fixture errors
- [ ] `bun run --cwd packages/specs test` passes including new phase-module tests
- [ ] `bun run mf:check:specs` reports zero issues for every spec in the store, with version warnings only
- [ ] `ts:check`, `lint:check`, and `format:check` pass
