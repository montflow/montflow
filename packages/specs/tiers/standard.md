---
tier: standard
phases-min: 1
phases-max: 2
tasks-max: 6
tasks-per-phase-max: 4
exploration: optional
gate: per-task
review: required
waiver: records-only
interaction: 2
grilling: not-loaded
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

# Tier: standard

A `standard` spec is one concern in one or two packages. It may add a surface
inside an existing contract, is reversible by revert, and has no cross-package
migration. Any user-visible requirement belongs here even when the diff is
modest.

## Phase plan

One or two phases. Each phase is a directory holding `PHASE.md`, its
`MEMORY.md`, a `BOARD.md`, and the task directories.

## Exploration

Exploration is optional: at most one exploratory task, only in the first phase,
and never a phase of its own. Look up facts in the repository instead of asking.

## Gates

Every task carries `GATES.md` with at least one command, or one named subjective
check when the task produces no runnable artifact (`planning`, `exploratory`,
or `review`). An empty gate is invalid.

## Review and waiver

Review is required by default. A phase whose tasks are all `planning`,
`exploratory`, or `review` may waive with a recorded reason; a phase holding an
`execution`, `defect`, or `interruptor` task cannot waive. A phase either
reviews or waives: a waived phase carries no review task, and its lock derives
from every task being complete and every gate proven.

## Artifact matrix

| Artifact                  | micro        | standard                                        | full            |
| ------------------------- | ------------ | ----------------------------------------------- | --------------- |
| `SPEC.md`                 | required     | required                                        | required        |
| `PHASE.md`                | required (1) | required (each)                                 | required (each) |
| `TASK.md`                 | required     | required                                        | required        |
| `MEMORY.md`               | required     | required                                        | required        |
| `GATES.md`                | required     | required                                        | required        |
| `review-task`             | absent       | required unless the phase is effectively waived | required        |
| `BOARD.md`                | absent       | required                                        | required        |
| `MAILBOX.md`              | absent       | conditional                                     | required        |
| exploratory task or phase | absent       | optional, one task                              | required phase  |

A `standard` spec writes one `BOARD.md` per phase and a `MAILBOX.md` only when a
phase holds more than one concurrent task. The artifact matrix above is the
whole set; no other artifact is required.

## Questions

This run may ask at most 2 questions. Ask only about the scope boundary, naming,
acceptance, or a real ambiguity the appraiser flagged. Ask one question at a
time, wait for the answer, then ask the next. Look up facts about the repository
instead of asking. At the cap, stop instead of guessing, and report the
unresolved decisions.

The creation run records its count in `SPEC.md` as `questions <n>/<budget>`;
the number is self-reported and the budget is advisory beyond this instruction
and the phase review.
