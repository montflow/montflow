# GATES

## Stage 0: Hook

- [x] `lefthook.yml` configures `pre-push` only
- [x] `bun run hooks:install` wires the hook from a clean clone under the worktree layout

## Stage 1: Behaviour

- [x] a failing fast gate blocks `git push`
- [x] `git push --no-verify` bypasses the hook
