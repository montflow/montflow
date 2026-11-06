---
rigor: trivial
phases-min: 1
phases-max: 1
tasks-max: 2
tasks-per-phase-max: 2
exploration: forbidden
gate: command-per-task
review: waived
waiver: permitted
interaction: 0
artifacts:
  - SPEC.md
  - PHASE.md
  - TASK.md
  - MEMORY.md
  - GATES.md
conditional-artifacts:
---

# Rigor: trivial

A `trivial` spec is one concern in one package or module, reversible by revert,
with no new public contract, no data or schema migration, no security or privacy
boundary, and no new dependency. A reviewer verifies it by reading the diff. A
request that needs discovery before it can be stated is not `trivial`.

## Phase plan

Exactly one phase, `A`, and no other. The phase is a directory holding
`PHASE.md`, its `MEMORY.md`, and the task directories. At most two work tasks
may live in that phase.

## Exploration

Exploration is forbidden: no exploratory phase and no exploratory task. If the
work cannot be understood from the request and a quick read, it was not
`trivial`.

## Gates

Every task directory carries `GATES.md`, and every task that changes a file
names at least one command. A prose-only gate is invalid here; if no command can
prove the task, the request was not `trivial`.

## Review and waiver

Review is waived by default. The appraiser may upgrade a phase that touches
authentication or data to `required`; a waiver is never forced. A waived phase
carries no review task, and its lock derives from every task being complete and
every gate proven.

## Artifacts

Every `trivial` phase carries `SPEC.md`, `PHASE.md`, `TASK.md`, `MEMORY.md`, and
`GATES.md`. It writes no `BOARD.md`, no `MAILBOX.md`, and no review task unless
the appraiser upgrades the phase to `required`; an upgrade adds the review task
only.

## Questions

This run may ask at most 0 questions. The budget includes the one escalation
question, so at `trivial` there is none to ask: a request that cannot be authored
without a user decision stops and reports the mismatch and the decision it needs.
Only the user may change the rigor; when the user raises it, record
`rigor: <new> (raised-from trivial)`. Never choose, default, or silently upgrade
the level. Facts about the repository are read, never asked.

The creation run records its count in `SPEC.md` as `questions <n>/<budget>`;
the number is self-reported and the budget is advisory beyond this instruction
and the phase review. After a raise, `<budget>` is the raised level's budget,
never `trivial`'s zero.
