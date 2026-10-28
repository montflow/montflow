---
id: F001
name: reconcile-with-main
type: execution
originator: planner:E099
depends-on: E099
related-tasks: D001
status: pending
---

# Task F001: reconcile with main

## Type: execution

## Description

Bring the branch's phase-directory work together with whatever landed on
`origin/main` while it was in progress. The layout change touches the spec store,
`packages/specs`, `apps/workspace`, and the two skill copies, so a concurrent
change on main is exactly where a silent conflict can hide.

## Requirements

- `git fetch origin`, then record `git rev-list --left-right --count HEAD...origin/main`
  before merging. If the branch is already at or ahead of `origin/main`, record
  that and do not create an empty merge commit.
- Merge `origin/main` into the feature branch (never force-push, never rewrite
  published history); resolve conflicts so the phase-directory layout wins on
  paths it owns and main's unrelated changes survive untouched.
- Re-run the scoped gates after the merge: `bun run --cwd packages/specs test`,
  `bun run --cwd apps/workspace test`, `bun run mf:check`, plus
  `bun run --cwd packages/specs lint:check format:check ts:check`.
- Record in MEMORY.md: the merge base, the counts, the merge commit (or the
  no-op reason), every conflicted file and how it was resolved, and the final
  `mf-specs check` line.
- Do not execute any other phase-F task here.

## Completion

- [ ] The branch contains `origin/main`; a merge commit exists or a no-op is recorded with the counts
- [ ] No conflict was resolved by dropping a main-side change
- [ ] All scoped gates pass and are quoted in MEMORY.md
- [ ] `git status` is clean apart from the task's MEMORY.md update
