---
id: F002
name: record-checks
type: execution
originator: user
size: medium
depends-on: F001
related-tasks:
status: complete
---

# Task F002: record-checks

## Type: execution

## Description

All 17 execution tasks in this spec carry the same unchecked scaffold `GATES.md`, and none of their completion boxes were checked when the tasks were marked complete. The review-cycle budget is enforced only by prose in the execute prompt.

Make the record state and the budget mechanically visible.

## Requirements

- A complete task with unchecked `## Completion` items yields a `task.completion-unchecked` warning naming the task file and the unchecked count.
- A complete task whose `GATES.md` has no checked item yields a `gate.unchecked` warning; the authoring skill states that a gate must name the task own verification commands, and the scaffold stub carries a replacement marker that review must remove.
- The review-link check verifies each series has no more rounds attributed to a phase than that phase review budget from `reviewCycles`; over-budget is an error naming series, phase, budget, and actual count.
- All new warnings flow through the F001 grouping so historical specs stay one line each.
- Tests cover unchecked completion, unchecked gates, a series exactly at budget, one over budget, and an untouched historical record.

## Completion

- [ ] Complete tasks with unchecked completion items produce a grouped warning
- [ ] Complete tasks with all-unchecked gates produce a grouped warning
- [ ] A review series over its phase budget fails check with series, phase, budget, and count
- [ ] The authoring skill and scaffold stub describe task-specific gates
- [ ] Record and budget tests pass without rewriting historical records
