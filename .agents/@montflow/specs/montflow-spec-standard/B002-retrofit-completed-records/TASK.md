---
id: B002
name: retrofit-completed-records
type: execution
originator: user
size: large
depends-on: B001
related-tasks: B003, B004
status: pending
---

# Task B002: retrofit completed records

## Type: execution

## Description

The store carries 395 warnings, and the two that matter are record contradictions:
135 `task.completion-unchecked` and 78 `gate.unchecked`. A task that says
`status: complete` while its completion or gate checklist is unchecked is claiming
work its own record does not confirm. Tighten both to errors and retrofit every
completed record so the store stays green.

Completed tasks with no size may opt out with `size: none`; that is the only
reason the warning can disappear without inventing a size for historical work.

## Requirements

- `task.completion-unchecked` is an error, not a warning, when a task is `complete`. A `pending`, `in-progress`, or `blocked` task with unchecked completion items is fine and silent.
- `gate.unchecked` is an error when a task is `complete`. A `pending`, `in-progress`, or `blocked` task may carry an all-unchecked gate with no finding.
- `size: none` is accepted only on a `complete` task. An unfinished task that declares it is an error, and `none` is never a dispatch target.
- A complete task with no size may declare `size: none`; a real size is not backfilled by guessing. Leave every existing real size untouched.
- Sweep every spec in the store. For each complete task, verify each unchecked completion item against its `MEMORY.md`, the commit, and the diff, and check only items that are true. An item that is not true is either finished in this task or the task is reopened; it is never ticked to silence the check.
- For each complete task whose gate has no checked item, run or inspect the named check, record the result in the task `MEMORY.md`, and check the items that passed. A gate that cannot be evidenced reopens the task or opens a defect.
- Update the tests, the shipped skill text, the prompts, the README, and the doctor payload so they describe the checks as errors and `size: none` as the completed-task opt-out.
- The retrofit leaves a short record per spec: how many completion items and gate items were checked, how many tasks were reopened, and which tasks received `size: none`.

## Completion

- [ ] A complete task with an unchecked completion item fails `mf-specs check` with `task.completion-unchecked`; a pending task with the same record passes
- [ ] A complete task with an all-unchecked gate fails with `gate.unchecked`; a pending task with the same gate passes
- [ ] Every complete task in the store has a real size or `size: none`, and no `task.missing-size` warning remains
- [ ] Every completed completion and gate item is checked, or its task is reopened with a recorded reason
- [ ] `mf:check` is green with zero `task.completion-unchecked`, `gate.unchecked`, or `task.missing-size` findings
- [ ] The shipped docs and doctor payload match the new severities and `size: none`
