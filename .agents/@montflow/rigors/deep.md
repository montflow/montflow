---
rigor: deep
phases-min: 2
phases-max: 3
tasks-max: 9
tasks-per-phase-max: 5
exploration: required
gate: phase-and-task
review: required
waiver: records-only
interaction: 4
artifacts:
  - SPEC.md
  - PHASE.md
  - TASK.md
  - MEMORY.md
  - GATES.md
  - review-task
  - BOARD.md
conditional-artifacts:
  - MAILBOX.md
---

# Rigor: deep

A `deep` spec touches more than one package, changes a public contract, needs a
data or schema migration, or has a failure that is not locally reversible. It
cannot be designed without discovery first.

## Phase plan

Two or three phases. Phase `A` carries the exploration, and every later phase
depends on the task that carries it. Each phase is a directory holding
`PHASE.md`, its `MEMORY.md`, a `BOARD.md`, and the task directories. At most
nine work tasks may live in the spec and at most five in one phase.

## Exploration

Exploration is required as one exploratory task in phase `A`. Later phases
`depends-on` that task and do not repeat the discovery.

## Gates

Every task carries `GATES.md` with at least one command, or one named subjective
check when the task produces no runnable artifact. Before each phase's review
round the phase records one mechanical run of the suite that phase touches, and
the review reads that result.

## Review and waiver

Review is required. A phase whose tasks are all `planning`, `exploratory`, or
`review` may waive with a recorded reason; a phase holding an `execution`,
`defect`, or `interruptor` task cannot waive. A waived phase carries no review
task, and its lock derives from every task being complete, every classified
mechanical gate proven, and either a closed review round or an effective
waiver.

## Artifacts

Every `deep` phase carries `SPEC.md`, `PHASE.md`, `TASK.md`, `MEMORY.md`,
`GATES.md`, its review task, and a `BOARD.md`. A `MAILBOX.md` appears when the
phase holds more than one concurrent task.

## Questions

This run may ask at most 4 questions. Use the `grilling` sequence: one question,
wait, then the next. Required topics are the scope boundary, acceptance,
non-goals, and the phase split. Look up facts about the repository instead of
asking. At the cap, stop instead of guessing, and report the unresolved
decisions.

The creation run records its count in `SPEC.md` as `questions <n>/<budget>`;
the number is self-reported and the budget is advisory beyond this instruction
and the phase review.
