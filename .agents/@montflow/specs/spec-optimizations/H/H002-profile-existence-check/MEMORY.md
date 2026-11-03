# Memory

## Context

Implemented profile-existence check in `mf-specs check`. Resolves the profiles root as the sibling of the specs root (`<specs-parent>/profiles`) and, when that root exists, emits one warning-severity `reviewer-profile.unknown` finding per declared, absent reviewer profile slug. Missing profiles root skips all findings. Warning never fails the check; `--strict` promotes it via existing reduceCheck logic.

## Progress

- Modified `packages/specs/src/apps/cli/cli.check.module.ts`:
  - import `parseTaskFile`, `REVIEWER_PROFILES_FIELD`
  - compute `profilesRoot` and `profilesRootExists` in `check()`
  - in `loadSpec`, after `verifySpecTree`, when profiles root exists, parse each `TASK.md`, and for `review` tasks check each declared slug for `<profilesRoot>/<slug>/PROFILE.md`; push `reviewer-profile.unknown` warning when absent.
- Verified typecheck, lint, format, and tests.

## Open Questions

- Exact message/fix strings follow the reviews package's established wording plus a repair hint; hidden tests may assert exact strings.

## Handoff

- Run `bun run mf:check:specs` (passes, no `reviewer-profile.unknown`).
- Package gates pass.

## Deviations

- None.

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
Gate items: checked against the runs recorded here and at HEAD.
