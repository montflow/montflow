---
rigor: light
phases-min: 1
phases-max: 1
tasks-max: 4
tasks-per-phase-max: 4
exploration: optional
gate: per-task
review: waived
waiver: permitted
interaction: 1
artifacts:
  - SPEC.md
  - PHASE.md
  - TASK.md
  - MEMORY.md
  - GATES.md
conditional-artifacts:
  - review-task
  - BOARD.md
  - MAILBOX.md
---

# Rigor: light

A `light` spec is one concern in one or two packages. It may add a surface
inside an existing contract, is reversible by revert, and has no cross-package
migration. The request is clear enough that a read of the affected code settles
the facts.

## Phase plan

Exactly one phase, `A`, and no other. The phase is a directory holding
`PHASE.md`, its `MEMORY.md`, and the task directories. At most four work tasks
may live in that phase.

## Exploration

Exploration is optional: at most one exploratory task, only in phase `A`, and
never a phase of its own. Look up facts in the repository instead of asking.

## Gates

Every task carries `GATES.md` with at least one command, or one named subjective
check when the task produces no runnable artifact (`planning`, `exploratory`, or
`review`). An empty gate is invalid.

## Review and waiver

Review is waived by default. The appraiser may upgrade phase `A` to `required`,
and a waiver is never forced. A waived phase carries no review task, and its
lock derives from every task being complete and every gate proven.

## Artifacts

Every `light` phase carries `SPEC.md`, `PHASE.md`, `TASK.md`, `MEMORY.md`, and
`GATES.md`. A `review-task` appears only when the appraiser upgrades the phase
to `required`. A `BOARD.md` and a `MAILBOX.md` appear when the phase holds more
than one concurrent task.

## Questions

This run may ask at most 1 question. Ask only about the scope boundary, naming,
acceptance, or a real ambiguity the appraiser flagged. Look up facts about the
repository instead of asking. At the cap, stop instead of guessing, and report
the unresolved decision.

The creation run records its count in `SPEC.md` as `questions <n>/<budget>`;
the number is self-reported and the budget is advisory beyond this instruction
and the phase review.
