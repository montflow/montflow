---
tier: micro
phases-min: 1
phases-max: 1
tasks-max: 2
tasks-per-phase-max: 2
exploration: forbidden
gate: command-per-task
review: waived
waiver: permitted
interaction: 0
grilling: forbidden
artifacts:
  - SPEC.md
  - PHASE.md
  - TASK.md
  - MEMORY.md
  - GATES.md
conditional-artifacts:
---

# Tier: micro

A `micro` spec is one concern in one package or module, reversible by revert,
with no new public contract, no data or schema migration, no security or privacy
boundary, and no new dependency. A reviewer verifies it by reading the diff.

## Phase plan

Exactly one phase, `A`, and no other. The phase is a directory holding
`PHASE.md`, its `MEMORY.md`, and the task directories.

## Exploration

Exploration is forbidden: no exploratory phase and no exploratory task. If the
work cannot be understood from the request and a quick read, it was not
`micro`.

## Gates

Every task directory carries `GATES.md`, and every task that changes a file
names at least one command. A prose-only gate is invalid here; if no command can
prove the task, the request was not `micro`.

## Review and waiver

Review is waived by default. The appraiser may upgrade a phase that touches
authentication or data to `required`; a waiver is never forced. A waived phase
carries no review task, and its lock derives from every task being complete and
every gate proven.

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

A `micro` spec writes no `BOARD.md` and no `MAILBOX.md`. The artifact matrix
above is the whole set; no other artifact is required.

## Questions

This run may ask at most 0 questions. If the request cannot be tiered and
authored without a user decision, it is not `micro`: choose `standard`, or stop
and report the question instead of asking. Facts about the repository are read,
never asked.

The creation run records its count in `SPEC.md` as `questions <n>/<budget>`;
the number is self-reported and the budget is advisory beyond this instruction
and the phase review.
