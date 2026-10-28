---
id: A003
name: explore-pre-push-hooks
type: exploratory
originator: user
depends-on:
related-tasks:
status: complete
---

# Task A003: Survey pre-push hook mechanisms

## Type: exploratory

## Description

Survey the realistic ways to run a pre-push gate in this repository and
recommend one, accounting for its bare-repo worktree layout.

## Requirements

- Catalogue the mechanisms: `core.hooksPath` plus a committed hook directory, husky, lefthook, simple-git-hooks, and the flake `shellHook`.
- For each: the install step, where configuration lives, whether it survives `bun install`, and its behaviour on a fresh clone.
- Account for this repo's layout: `.git` is a file pointing at a bare-repo worktree (`gitdir: .../worktrees/main`), and direnv/nix provides the shell.
- Establish whether a hook configured in one worktree affects the others under the same common git directory.
- Confirm the chosen mechanism supports an intentional bypass (`git push --no-verify`) and does not run when there is no repository.
- Recommend a mechanism that is discoverable, version-controlled, and needs no new dependency, with trade-offs recorded.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [x] Mechanism comparison and recommendation captured in MEMORY.md
