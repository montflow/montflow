# Memory

## Context

E001 merges `origin/main` (which moved every spec task under a phase directory
and added the `spec-completion` trailer gate) into this branch.

## Progress

- complete: merged `origin/main` with a merge commit (`437d3fe`), no rebase and
  no force push.
- Resolved the one conflict in `packages/specs/src/apps/cli/cli.apps.module.ts`
  by keeping both sides: `@montflow/version`/`PACKAGE_IDENTITY` and the new
  `PHASE_PATTERN` import, plus `Cli.versionCommand` alongside `migrateCommand`.
- Ran `mf-specs migrate --name cli-version-awareness`: all 16 task directories
  moved under `A/`–`E/` with contents intact.
- Verified: specs 486 tests, skills 443, version 154; lint/format/typecheck for
  specs/skills/version; `mf:check:skills/prompts/profiles/reviews` green;
  `check --name cli-version-awareness` green.

## Open Questions

- None.

## Handoff

- E002 fixes the CI-only tag fixture, pushes, opens the PR, and satisfies the
  completion gate.

## Deviations

- Repo-wide `mf:check:specs` currently fails on the unrelated, uncommitted
  `installation-guide` work in this worktree (15 issues from local WIP, not from
  this branch's commits). The scoped spec check for `cli-version-awareness` is
  green; the unrelated files were left untouched.
