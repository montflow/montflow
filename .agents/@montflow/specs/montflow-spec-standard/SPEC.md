---
name: montflow-spec-standard
status: in-progress
workspace-type: in-place
author: Daniel Montilla
created: 2026-10-07
locked-phases:
  - A
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
and prompts (today a bogus skill name verifies clean). Phase B reconciles main,
then decides the tiers, the v2 standard, and the tooling contract. Phase C
implements them, ships the five spec-role profiles and the two pipeline prompts
as package payloads installed by `doctor`, and adds the generator verbs that
retire hand-written mechanics.

Main moved while this spec was paused. `spec-optimizations` landed task sizes,
the sizing config and catalogue, the shipped prompts, the doctor module, review
budgets, and the `author` / `execute` / `sizing-config` verbs; the same period
reverted the phase-directory layout that `montflow-phase-directories` had already
completed. This standard overrides that flat layout. B001 reconciles the two:
keep the landed sizing, prompt, doctor, and review-budget work, restore the phase
tree, delete the hand-written lock list and the reserved review task, and teach
every CLI and TUI surface the derived phase state before Phase B decides
anything. B002 then hardens the record checks and retrofits every completed
task's completion and gate checklist, so a `complete` status can no longer
contradict its own record.

## Requirements

- `Issue` carries a severity with warnings defaulting to non-fatal, a `--strict` promotion, and a `fix` field on par with the prompts package's richer issue shape.
- Profile and prompt verifiers resolve `skills:` names against the workspace skill store and report misses with the offending name; a missing reference never verifies clean again.
- The complexity tier is a defined enum with one source of truth in code, a per-tier artifact matrix, a per-tier user-interaction budget, and a test that fails when the instruction files or skill text drift from the constant.
- The tier is the spec-level choice; main's per-task `size` stays the dispatch and review-budget knob. The two never restate each other.
- Above the largest tier the appraiser returns a split verdict naming the proposed cut, not a tier.
- The v2 standard overrides main's flat layout: B001 keeps the landed task size, sizing config, prompts, doctor, and review-budget work, restores `<spec>/<PHASE>/<task>/`, deletes the hand-written lock list and the reserved `<PHASE>099` task, and migrates every spec before Phase B decides.
- A phase is a directory with its own `PHASE.md` (objective, status, review decision, gate kind), gate file, memory, and broadcast board; tasks live under it and numbering restarts per phase.
- Phase locks are derived from completed tasks, a recorded gate result, and a review round attributed to the phase; the hand-written lock list and the bookkeeping-contradiction state it existed to catch are gone.
- Review is a per-phase decision, `required` or `waived` with a reason, set by the appraiser and recorded in the phase; the reserved `<PHASE>099` task id and its structure check are deleted in B001, and a waiver's record is decided in B004.
- Every `mf-specs` command and the TUI specs picker read the phase tree and the derived state; a phase or task directory is never offered as a spec, and no surface reads `locked-phases`.
- A complete task may declare `size: none` instead of a real size. `none` is a record opt-out, never a dispatch target; an unfinished task that declares it is an error.
- An unchecked completion item or an all-unchecked gate on a `complete` task is an error; an unfinished task may carry unchecked completion and gate items.
- The retrofit proves every completed record before the checks harden, so the tightened errors never need a mass exemption.
- A gate stage declares `kind: mechanical` or `kind: subjective`; mechanical stages are executed by the CLI with the result recorded, subjective stages are consumed by a reviewer role.
- `SPEC.md` carries a spec-version read as 1 when absent, warning below the current standard, erroring above it, and accepting current and previous so a spec is never stranded mid-migration.
- `migrate` transforms a v1 tree into the v2 shape; relabeling the version field without transforming the structure is rejected.
- `BOARD.md` is the phase broadcast and `MAILBOX.md` the per-task targeted channel, both append-only with an entry grammar the verifier parses; delivery to a live task session goes through steering the bound session.
- Spec state is written by one orchestrator per spec; workers write only their own memory, never status or locks, and escalate questions instead of asking the user directly.
- Ids, timestamps, status transitions, locks, and the whole tree come from CLI verbs (`new-phase`, `new-task`, `stamp`, `init`, `claim`, `lock`, `state`, `next`, `gate run`, `mail`); the rule is that anything a verifier checks has a generator.
- `doctor` diagnoses and repairs a manifest of shipped payload kinds, `--check` reports without writing, and `mf:check` runs every package's doctor; report-only mode is what every `mf:check:*` script uses.
- The payload manifest replaces the hardcoded per-package name lists, the six embedded-payload generators are shared instead of duplicated, and packaged binaries keep a working `doctor`.
- The five spec-role profiles, the shipped pipeline prompts, and the tier instruction files ship as package payloads and are installed by `doctor`, not hand-copied into a workspace.
- The CI-mutation and compiled-binary defects found in Phase A are fixed, and every decision lands in the docs and the bookkeeper's artifact ledger so the stores stay accurate.
- The exploratory and planning tasks (A001, A002, B003–B005) modify no file outside `.agents/@montflow/specs/`; the execution tasks B001, B002, A003, and A004 are expected to change `packages/specs`, `packages/profiles`, and `packages/prompts`.

## Tasks

| ID   | Name                                | Type        | Status  | Gates |
| ---- | ----------------------------------- | ----------- | ------- | ----- |
| A001 | explore-verification-surface        | exploratory | complete | No    |
| A002 | explore-payload-doctor-surface      | exploratory | complete | No    |
| A003 | add-issue-severity-channel          | execution   | complete | Yes   |
| A004 | add-artifact-reference-resolution   | execution   | complete | Yes   |
| A099 | review-phase                        | review      | complete | No    |
| B001 | reconcile-main-and-phase-rail       | execution   | pending | Yes   |
| B002 | retrofit-completed-records          | execution   | pending | Yes   |
| B003 | decide-complexity-tiers             | planning    | pending | No    |
| B004 | decide-spec-standard-v2             | planning    | pending | No    |
| B005 | decide-tooling-contract             | planning    | pending | No    |
| B099 | review-phase                        | review      | pending | No    |
| C001 | implement-version-and-structure    | execution   | pending | Yes   |
| C002 | implement-gate-kinds-and-execution  | execution   | pending | Yes   |
| C003 | implement-board-and-mailboxes       | execution   | pending | Yes   |
| C004 | implement-doctor-payload-manifest   | execution   | pending | Yes   |
| C005 | implement-mechanical-state-verbs    | execution   | pending | Yes   |
| C006 | ship-spec-artifact-payloads         | execution   | pending | Yes   |
| C007 | align-docs-and-artifact-ledger      | execution   | pending | No    |
| C008 | align-cli-and-tui-surfaces          | execution   | pending | Yes   |
| C099 | review-phase                        | review      | pending | No    |
