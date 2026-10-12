---
name: montflow-spec-standard
status: in-progress
workspace-type: in-place
author: Daniel Montilla
created: 2026-10-07
locked-phases:
---

# Montflow spec standard overhaul

## Description

A spec today is a flat list of task directories whose "phase" is only the
leading letters of a task id (`A001` is phase `A`), whose locks are typed by
hand, and whose `GATES.md` is a checkbox list that the verifier checks only for
*shape* — it never runs the command a gate names. There is no phase entity, so
a phase cannot hold an objective, a gate, a memory, or a verdict. There is no
complexity tier, so a hotfix is required to carry the same `099-review-phase`
ceremony as a multi-package refactor, and both existing specs grew to 15-17
task directories. Execution lives in a TypeScript template literal
(`skills/executing-spec.ts`), so the protocol an agent follows is not something
the verifier can check.

Overhaul the concept and the structure. Phases become real directories holding
their own gate, memory, and blackboard; tasks live inside them and may run in
parallel under a single state-writer. Gates become stages that are either
mechanical (the CLI runs them and records the result) or subjective (a reviewer
role judges them). Locks, ids, timestamps, and status transitions become
derived or CLI-generated, never hand-typed. A fast, strictly surface-level
appraiser picks a complexity tier from a defined enum and the tier decides
which phases, reviews, gates, and user questions a spec gets — including
whether an exploration phase is needed at all, and whether the request should
be split into several specs. Two pipelines drive it: creation
(orchestrator, appraiser, bookkeeper) and execution (orchestrator, workers with
specialist roles, bookkeeper, appraiser), communicating through a phase
broadcast board and per-task mailboxes.

None of that can land on the current primitive: `Issue` carries no severity, so
the first warning ever added turns CI red. So this spec goes foundation-first.
Phase A inventories the verification and payload surfaces and lands two rails:
a severity channel, and reference resolution for the `skills:` lists in profiles
and prompts (today a bogus skill name verifies clean). Phase B decides the
tiers, the v2 standard, and the tooling contract. Phase C implements them,
ships the five spec-role profiles and the two pipeline prompts as package
payloads installed by `doctor`, and adds the generator verbs that retire
hand-written mechanics.

## Requirements

- `Issue` carries a severity with warnings defaulting to non-fatal, a `--strict` promotion, and a `fix` field on par with the prompts package's richer issue shape.
- Profile and prompt verifiers resolve `skills:` names against the workspace skill store and report misses with the offending name; a missing reference never verifies clean again.
- The complexity tier is a defined enum with one source of truth in code, a per-tier artifact matrix, a per-tier user-interaction budget, and a test that fails when the instruction files or skill text drift from the constant.
- Above the largest tier the appraiser returns a split verdict naming the proposed cut, not a tier.
- A phase is a directory with its own `PHASE.md` (objective, status, review decision, gate kind), gate file, memory, and broadcast board; tasks live under it and numbering restarts per phase.
- Phase locks are derived from completed tasks, a recorded gate result, and a recorded review or waiver; the hand-written lock list and the bookkeeping-contradiction state it existed to catch go away.
- Review is a per-phase decision, `required` or `waived` with a reason, set by the appraiser and recorded in the phase; the reserved `<PHASE>099` task id and its structure check are deleted.
- A gate stage declares `kind: mechanical` or `kind: subjective`; mechanical stages are executed by the CLI with the result recorded, subjective stages are consumed by a reviewer role.
- `SPEC.md` carries a spec-version read as 1 when absent, warning below the current standard, erroring above it, and accepting current and previous so a spec is never stranded mid-migration.
- `migrate` transforms a v1 tree into the v2 shape; relabeling the version field without transforming the structure is rejected.
- `BOARD.md` is the phase broadcast and `MAILBOX.md` the per-task targeted channel, both append-only with an entry grammar the verifier parses; delivery to a live task runs goes through steering the bound run.
- Spec state is written by one orchestrator per spec; workers write only their own memory, never status or locks, and escalate questions instead of asking the user directly.
- Ids, timestamps, status transitions, locks, and the whole tree come from CLI verbs (`new-phase`, `new-task`, `stamp`, `init`, `claim`, `lock`, `state`, `next`, `gate run`, `mail`); the rule is that anything a verifier checks has a generator.
- `doctor` diagnoses and repairs a manifest of shipped payload kinds, `--check` reports without writing, and `sync:montflow` runs every package's doctor; report-only mode is what every `verify:montflow:*` script uses.
- The payload manifest replaces the hardcoded per-package name lists, the embedded-payload generator is shared instead of duplicated, and packaged binaries keep a working `doctor`.
- The five spec-role profiles, the two pipeline prompts, the tier instruction files, and a promoted spec-execution skill ship as package payloads and are installed by `doctor`, not hand-copied into a workspace.
- The CI-mutation and compiled-binary defects found in Phase A are fixed, and every decision lands in the docs and the bookkeeper's artifact ledger so the stores stay accurate.
- Phase A and Phase B modify no file outside `.agents/@montflow/specs/`.

## Tasks

| ID   | Name                                | Type        | Status  | Gates |
| ---- | ----------------------------------- | ----------- | ------- | ----- |
| A001 | explore-verification-surface        | exploratory | pending | No    |
| A002 | explore-payload-doctor-surface      | exploratory | pending | No    |
| A003 | add-issue-severity-channel          | execution   | pending | Yes   |
| A004 | add-artifact-reference-resolution   | execution   | pending | Yes   |
| A099 | review-phase                        | review      | pending | No    |
| B001 | decide-complexity-tiers             | planning    | pending | No    |
| B002 | decide-spec-standard-v2             | planning    | pending | No    |
| B003 | decide-tooling-contract             | planning    | pending | No    |
| B099 | review-phase                        | review      | pending | No    |
| C001 | implement-version-and-structure    | execution   | pending | Yes   |
| C002 | implement-gate-kinds-and-execution  | execution   | pending | Yes   |
| C003 | implement-board-and-mailboxes       | execution   | pending | Yes   |
| C004 | implement-doctor-payload-manifest   | execution   | pending | Yes   |
| C005 | implement-mechanical-state-verbs    | execution   | pending | Yes   |
| C006 | ship-spec-artifact-payloads         | execution   | pending | Yes   |
| C007 | align-docs-and-artifact-ledger      | execution   | pending | No    |
| C099 | review-phase                        | review      | pending | No    |
