---
id: A004
name: backfill
type: execution
originator: user
size: small
depends-on: A001, A003
related-tasks:
status: complete
---

# Task A004: backfill

## Type: execution

## Description

Apply the new task-size contract to the existing specs. Every task that still
represents pending work must declare an explicit size; completed work may stay
unsized and keep only the warning. This is a judgement pass over the real task
descriptions, not a blanket default.

## Requirements

- Audit every spec under `.agents/@montflow/specs/` and list each task that is
  `pending`, `in-progress`, or `blocked` without a size.
- Add `size` to each audited task by reading its `TASK.md` scope and choosing
  `tiny`, `small`, `medium`, or `large`. Record the reason for each choice in the
  task's `MEMORY.md` or in this task's `MEMORY.md`.
- Leave completed tasks unsized. Do not add `size` mechanically to historical
  work just to silence the verifier.
- Do not add a repo-level `sizing.json` or commit model ids. Absent config is a
  valid state and resolves to `inherit`.
- Re-run the full spec verifier and report every remaining warning with its
  reason.

## Completion

- [ ] No pending, in-progress, or blocked task in any spec lacks `size`
- [ ] `bun run --cwd packages/specs cli check --dir "$PWD"` reports zero errors
- [ ] Remaining warnings are completed tasks only, and are named in the receipt
- [ ] The audit and each size choice are recorded in `MEMORY.md`
