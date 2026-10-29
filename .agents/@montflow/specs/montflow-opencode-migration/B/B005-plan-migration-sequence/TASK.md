---
id: B005
name: plan-migration-sequence
type: planning
originator: user
depends-on: B001, B002, B003, B004
related-tasks:
status: complete
---

# Task B005: Plan the execution sequence

## Type: planning

## Description

Order the rewrite into execution phases with cut criteria and rollback, so each
phase ships something independently verifiable and the riskiest work lands last.

## Requirements

- Produce ordered execution phases (C, D, …) naming the packages and the adapter seams each phase exercises.
- Order cheapest-and-most-isolating first: pure-Effect domain packages before session- and TUI-dependent ones, and validate the plugin loader end to end in the first execution phase.
- Place the retire-`pi-sessions` step where it can be validated against the native session/subagent system, not assumed.
- For each phase, specify the cut criterion (what makes it shippable independently) and the rollback.
- Specify the validation checkpoint at each phase and the dependency graph between execution phases, including what may run in parallel.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Ordered execution phases with cut and rollback recorded
- [ ] First-phase loader validation and pi-sessions retirement step placed
- [ ] Phase dependency graph and parallel-work notes captured
