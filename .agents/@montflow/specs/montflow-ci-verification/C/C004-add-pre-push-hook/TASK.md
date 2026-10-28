---
id: C004
name: add-pre-push-hook
type: execution
originator: planner:B002
depends-on: C002
related-tasks:
status: complete
---

# Task C004: Add the pre-push hook

## Type: execution

## Description

Add Lefthook and a `pre-push` hook running the fast subset, per B001 decisions
4–5.

## Requirements

- Add `lefthook` as a devDependency and a committed `lefthook.yml`.
- Configure only a `pre-push` hook running `bun run verify:montflow:fast`; leave `pre-commit` unset.
- Add a `hooks:install` script wrapping `lefthook install`; document it as the one install command.
- Confirm the hook works under this repo's bare-repo worktree layout and that `git push --no-verify` bypasses it.
- A checkout without the hook still gets full coverage in CI.

## Completion

- [x] `lefthook.yml` and `hooks:install` committed
- [x] a failing fast gate blocks a push locally
