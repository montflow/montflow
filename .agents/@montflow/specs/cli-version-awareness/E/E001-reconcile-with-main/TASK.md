---
id: E001
name: reconcile-with-main
type: execution
originator: user
depends-on: D003
related-tasks:
status: pending
---

# Task E001: reconcile-with-main

## Type: execution

## Description

Bring the branch up to date with `main` after the phase-directory migration and
the new spec-completion CI gate, without rewriting published history.

## Requirements

- Merge `origin/main` into `feat/cli-version-awareness` (a merge commit; never
  rebase or force-push).
- Migrate `cli-version-awareness` to the new phase-directory layout
  (`<phase>/<task>/`) with `mf-specs migrate --name cli-version-awareness`.
- Keep every task's `TASK.md`, `MEMORY.md`, and `GATES.md` content intact
  through the move; update the spec table if the migration changes a name.
- Resolve any conflicts in favour of this branch's feature work while retaining
  main's structure/CI changes.
- Run the scoped gates after the merge: `mf:check`, package tests for the
  touched packages, lint, format, typecheck.

## Completion

- [ ] Done.
