# GATES

## Stage 0: Hook

- [ ] `lefthook.yml` configures `pre-push` only
- [ ] `bun run hooks:install` wires the hook from a clean clone under the worktree layout

## Stage 1: Behaviour

- [ ] a failing fast gate blocks `git push`
- [ ] `git push --no-verify` bypasses the hook
