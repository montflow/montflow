---
id: F001
name: pull-and-reconcile
type: execution
originator: user
depends-on: E099
related-tasks: F002
status: complete
---

# Task F001: Pull from main and reconcile

## Type: execution

## Description

Bring the feature branch up to date with `origin/main` before a PR, so the
review reads a branch that already contains every merged change. Reconcile
conflicts deliberately: the references work retires skills and moves the
registry, so a merge with main can resurrect retired files or drop new ones.

## Requirements

- Fetch `origin` and record the divergence (`git rev-list --left-right --count origin/main...HEAD`) before and after.
- Merge `origin/main` into the feature branch (never force-push, never rewrite shared history).
- Resolve every conflict by intent, not by side: a retired skill stays retired when main only bumped its old copy; a new main-side skill or doc keeps its content unless the references surface supersedes it.
- Re-run the full gate after the merge: `bun run mf:check`, `turbo test`, `turbo ts:check`, `turbo lint:check`, `turbo format:check`, and the TUI suite when phase G exists.
- Confirm the store still verifies (`mf:check:references`) and the installed skills are current (`doctor --check`).
- Record every resolution and its reason in MEMORY.md, including any main-side change deliberately kept.
- No file outside the merge itself is modified without a recorded reason.

## Completion

- [ ] Branch merges `origin/main` with no unresolved conflict
- [ ] Full gate passes on the merged tree
- [ ] Every conflict resolution recorded with its reason
