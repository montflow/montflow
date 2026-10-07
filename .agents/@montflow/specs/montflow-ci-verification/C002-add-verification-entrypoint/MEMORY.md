# Memory

## Context

Task C002: add the shared verification entry point that CI and the pre-push
hook both call (B001 decisions 3, 7).

## Progress

- 2026-10-07: complete.

## Findings

### Root scripts

| Script | Runs |
| ------ | ---- |
| `verify:montflow:skills` | `mf-skills verify --dir $PWD` + `mf-skills doctor --check --dir $PWD` |
| `verify:montflow:prompts` | `mf-prompts verify --all --dir $PWD/.agents/@montflow/pi-prompts` + `mf-prompts doctor --check --dir $PWD` |
| `verify:montflow:specs` | `mf-specs check --dir $PWD/.agents/@montflow/specs` |
| `verify:montflow:profiles` | `mf-profiles --dir $PWD` |
| `verify:montflow:runs` | `mf-runs doctor` |
| `verify:montflow:extensions` | all five above, fail-fast |
| `verify:montflow:fast` | `turbo lint:check && turbo format:check && turbo ts:check` + `verify:montflow:extensions` |
| `verify:montflow` | fast set + `turbo test` |

Per-check scripts exist so a CI matrix cell names exactly one failing target.
The aggregate chains them for the hook and local use.

### Verification

`bun run verify:montflow:extensions` → exit 0, every check green:
skills `46 skills · 0 issues` + `up to date`; prompts `2 prompts · 0 issues`
+ `up to date`; specs `2 specs · 0 failed · 0 issues`; profiles
`5 profiles · 0 issues`; runs skill installed.

The gate immediately caught a real drift: B002 was `complete` in `TASK.md`
but `pending` in `SPEC.md`; fixed in the same task.

## Open Questions

- Whether `verify:montflow` should also run `test:tui` (still open from A001).

## Handoff

- Feeds C003 add-ci-workflow and C004 add-pre-push-hook.

## Deviations

- Added per-check scripts beyond the B002 sketch so the CI matrix is
  attributable without re-running the whole gate per cell.
