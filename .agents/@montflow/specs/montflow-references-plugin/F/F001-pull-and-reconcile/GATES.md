# GATES

## Stage 0: Merge

- [ ] `git log --merges -1` shows the main merge; `git status` clean
- [x] `git rev-list --left-right --count origin/main...HEAD` reports behind `0`
- [x] no retired skill file (`adding-references`, `finding-references`) is resurrected

## Stage 1: Post-merge verification

- [x] `bun run mf:check` passes
- [x] `turbo test`, `turbo ts:check`, `turbo lint:check`, `turbo format:check` pass
- [x] `bun run mf:check:references` reports 0 issues and `doctor --check` 0 failures
