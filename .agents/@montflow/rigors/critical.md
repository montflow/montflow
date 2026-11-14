---
rigor: critical
phases-min: 2
phases-max: 4
tasks-max: 12
tasks-per-phase-max: 6
exploration: required
gate: phase-and-task
review: required
waiver: forbidden
interaction: 8
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

# Rigor: critical

A `critical` spec touches more than one package while changing a public contract,
needs a data or schema migration, crosses a security or privacy boundary, or has
a failure that is expensive or impossible to reverse. It cannot be designed
without a discovery phase of its own.

## Phase plan

Two to four phases. Phase `A` is a dedicated exploration phase, and every later
phase depends on the task that carries that exploration. Each phase is a
directory holding `PHASE.md`, its `MEMORY.md`, a `BOARD.md`, and the task
directories. At most twelve work tasks may live in the spec and at most six in
one phase.

## Exploration

Exploration is required as a dedicated phase `A`. The exploration phase holds
exploratory tasks only; later phases `depends-on` its findings and do not repeat
the discovery.

## Gates

Every task carries `GATES.md` with at least one command, or one named subjective
check when the task produces no runnable artifact. Before each phase's review
round the phase records one mechanical run of the suite that phase touches, and
the review reads that result.

## Review and waiver

Review is required, and a `critical` phase never waives. Its lock derives from
every task being complete, every classified mechanical gate proven, and a
closed review round.

## Artifacts

Every `critical` phase carries `SPEC.md`, `PHASE.md`, `TASK.md`, `MEMORY.md`,
`GATES.md`, its review task, a `BOARD.md`, and a `MAILBOX.md`.

## Questions

This run may ask at most 8 questions. Use the `grilling` sequence: one question,
wait, then the next. Required topics are the scope boundary, acceptance,
non-goals, the phase split, and which phases carry the discovery. Look up facts
about the repository instead of asking. At the cap, stop instead of guessing,
and report the unresolved decisions.

The creation run records its count in `SPEC.md` as `questions <n>/<budget>`;
the number is self-reported and the budget is advisory beyond this instruction
and the phase review.
