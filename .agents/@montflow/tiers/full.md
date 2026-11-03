---
tier: full
phases-min: 2
phases-max: 4
tasks-max: 12
tasks-per-phase-max: 6
exploration: required
gate: phase-and-task
review: required
waiver: forbidden
interaction: 8
grilling: required
artifacts:
  - SPEC.md
  - PHASE.md
  - TASK.md
  - MEMORY.md
  - GATES.md
  - review-task
  - BOARD.md
  - MAILBOX.md
conditional-artifacts:
---

# Tier: full

A `full` spec touches more than one package, changes a public contract, needs a
data or schema migration, has a failure that is not locally reversible, or
cannot be designed without discovery first.

## Phase plan

Two to four phases. Phase `A` is a dedicated exploration phase, and every later
phase depends on the task that carries that exploration. Each phase is a
directory holding `PHASE.md`, its `MEMORY.md`, a `BOARD.md`, and the task
directories.

## Exploration

Exploration is required as phase `A`. The exploration phase holds an
exploratory task; later phases `depends-on` it and do not repeat the discovery.

## Gates

Every task carries `GATES.md` with at least one command, or one named subjective
check when the task produces no runnable artifact. Before each phase's review
round the phase records one mechanical run of the suite that phase touches, and
the review reads that result.

## Review and waiver

Review is required, and a `full` phase never waives. A phase either reviews or
waives; a waived phase carries no review task, and its lock derives from every
task being complete, every classified mechanical gate proven, and either a
closed review round or an effective waiver.

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

A `full` spec writes a `BOARD.md` and a `MAILBOX.md` in every phase and task.
The artifact matrix above is the whole set; no other artifact is required.

## Questions

This run may ask at most 8 questions. Use the `grilling` sequence: one
question, wait, then the next. Required topics are the scope boundary,
acceptance, non-goals, the phase split, and which phases may waive review. Look
up facts about the repository instead of asking. At the cap, stop instead of
guessing, and report the unresolved decisions.

The creation run records its count in `SPEC.md` as `questions <n>/<budget>`;
the number is self-reported and the budget is advisory beyond this instruction
and the phase review.
