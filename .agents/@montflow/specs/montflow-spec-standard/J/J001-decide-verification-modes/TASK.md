---
id: J001
name: decide-verification-modes
type: planning
originator: user
size: tiny
depends-on: 
write-scope: none
related-tasks: J002, J003, J004
status: complete
---

# Task J001: decide-verification-modes

## Type: planning

## Description

Decide the light versus full verification contract per dispatch target, so J002 can implement one default and J003 can wire it through lock and review.

## Requirements

- Define verification light as task-local gates only, full as task plus phase plus repo-wide gates plus review.
- Fix the sizing schema value name, default, and inheritance rule for empty entries.
- Name the resolve output and the lock and review behavior each mode triggers, including the audit line.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [x] Done.
