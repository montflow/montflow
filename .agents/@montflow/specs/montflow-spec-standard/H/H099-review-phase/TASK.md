---
id: H099
name: review-phase
type: review
originator: user
size: medium
depends-on: H001, H002, H003, H004
related-tasks:
status: complete
---

# Task H099: review the rigor and isolation phase

## Type: review

## Description

An independent hostile review of the five-level rigor ladder and the isolated
authoring flow: does the user's choice actually control the shape, can a lower
level silently under-spec a request, can an isolated run author in the wrong
place or nest a worktree, and do the prompt, skill, profile, tier files, and
entry points agree?

## Requirements

- Attack the ladder: every level has a distinct, testable shape; a level whose
  ceiling the work exceeds cannot silently raise itself; the user's choice is
  recorded, and the appraiser only recommends or escalates.
- Confirm the five tier files, the drift test, and the skill table agree
  field-by-field, and that no rigor file names a size, model, effort, or
  review-cycle count.
- Confirm the prompt's conditional variables behave: `isolated: no` never asks
  or renders origin/worktree, `origin: other` carries the freeform branch, and a
  stale answer cannot survive a yes→no→yes switch.
- Confirm the worktree flow delegates to `using-git-worktrees`, uses
  `workspace-type: worktree`, does not nest an existing isolation, and does not
  push or mutate a branch unless H001 says so.
- Confirm the binary, slash, host tool, and `/mf-prompts` paths accept the same
  answers and render the same text; confirm no CLI writes a worktree.
- Run `bun run mf:check` and the scoped package suites; every spec and prompt
  must remain clean.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [x] Review written to the series
      `.agents/@montflow/reviews/montflow-spec-standard/017/REVIEW.md` (re-review
      of 016) and read by the human
- [x] Every finding about an under-specified level, a silently raised level, a
      misplaced or nested worktree, or a surface disagreement has a disposition
- [x] `bun run mf:check` green with the five-level ladder and prompt in place
