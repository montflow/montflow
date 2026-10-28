# Memory

## Context

Task C004: add Lefthook with a `pre-push` hook running the fast subset
(B001 decisions 4–5).

## Progress

- 2026-10-07: complete.

## Findings

### Hook

- `lefthook@2.1.10` pinned as a root devDependency (`bun add -d lefthook@2.1.10`).
- `lefthook.yml` configures only `pre-push`, running `bun run verify:montflow:fast`
  behind a guard: if `package.json` lacks `verify:montflow:fast` (a sibling
  worktree on an older commit), it prints a message instead of failing.
- `hooks:install` root script: `lefthook install`.

### Verification

- `bun run hooks:install` → `sync hooks: ✔️(pre-push)`; the hook lands at
  `/home/daniel/dev/montflow/.bare/hooks/pre-push` (mode `100755`).
- `git rev-parse --git-path hooks` = the same `.bare/hooks`; `core.hooksPath`
  stays unset.
- Scratch clone + bare remote: a real `git push` ran the hook and was blocked
  by a failing command (`GATE RAN`, exit 1).
- `git push --no-verify` and `LEFTHOOK=0 git push` both bypassed the hook
  (exit 0).
- `git hook run pre-push` in this repo skipped (lefthook reports "no matching
  push files") because that simulation passes no refs; a real push does run it.

## Open Questions

- Whether to also forbid `pre-commit` explicitly (it is simply unset today).

## Handoff

- Feeds C006 document-verification.

## Deviations

- None.
