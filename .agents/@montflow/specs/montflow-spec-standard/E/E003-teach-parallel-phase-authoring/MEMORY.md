# Memory

## Context

Teach the parallel phase shape, write scopes, two gate layers, board/mailbox
protocol, and scheduler in the authoring and execution artifacts, then fix the
freshness rule so an append-only `GATE-RESULTS.jsonl` can recover from a stale
green. Bound E003 only; official gates stay with the orchestrator.

## Progress

- 2026-11-03: read profile, TASK/GATES, phase brief, E001/E002 memories.
- Taught the authoring rule in `montflow-create-specs` (v2.16.0) and the
  `spec-create` prompt; execution rules in `spec-execute` and the orchestrator,
  worker, appraiser, and creation-orchestrator profiles; README, find-specs,
  package/profile changelogs, and the drift test.
- Sync path: `mf-specs doctor`, `mf-profiles doctor`, both `generate:payload`.
- Steering fix: `verifyResultFreshness` now evaluates only the latest record per
  stage (`latestResults`), so a rerun under a new key supersedes an older pass.
- Added the supersede test beside the lone-stale-pass test in
  `src/apps/cli/tests/gate-scheduler.test.ts`; updated the doc comment.
- Record: MEMORY <=80 lines; full log `/tmp/E003.log`.

## Findings

- Artifacts teach: phase = widest ready set; every task declares `write-scope:`;
  `depends-on` carries only a real dependency; a serial phase states
  `serial-reason:`; task gates are task-local and phase-shared checks are named
  once; `BOARD.md` broadcasts, `MAILBOX.md` targets, and the worker reads both at
  start and before its receipt; `gate run` keys, single-flights, reuses passes,
  and bounds lanes.
- The appraiser names each phase's independent tasks and shared checks and says
  why a phase is serial; the creation orchestrator carries that into
  `init`/`new-task` and the two gate layers.
- The drift test mutates every new marker, so removing or inverting the parallel
  or scheduler prose fails the suite (86 tests in the lean-contract run).
- Freshness semantics now match `verifyGateResults`: a superseded pass is
  ignored, a lone stale pass still errors, a later failure supersedes a pass
  (complete owners then read `gate.unproven`), and an effective unkeyed pass
  still warns on an unfinished owner.
- After the freshness fix, `check` reports two `gate.stale-result` errors: the
  orchestrator's E002 and E003 stage-3 passes were recorded under key
  `gate-v1:21f42a…` before this code edit moved the `packages/specs`
  fingerprint to `ad90d313…`. Only an orchestrator `gate run` can refresh them.
- The contract names `phase.write-scope-overlap`,
  `phase.serial-chain-unexplained`, `gate.shared-check-in-task`,
  `gate.duplicate-command`, and `gate.scope-missing`; all five now fire in
  `check` (`structure.parallel.module.ts`, `structure.module.ts`), and
  `new-task`/`init`/`create` emit `write-scope:`.
## Gates

- Scoped only; every official `GATES.md` stage left to the orchestrator. Full
  log `/tmp/E003.log`.
- `packages/specs` test: 140 files / 1981 tests, exit 0.
- `packages/profiles` test: 42 files / 202 tests, exit 0.
- Both packages: `ts:check` 0, `lint:check` 0, `format:check` 0.
- Both `doctor --check`: exit 0; single-artifact verify: 2 skills, 2 prompts,
  4 profiles, 0 issues.
- `check --name montflow-spec-standard`: exit 1, `1 spec · 1 failed · 2 issues`
  (the two stale stage-3 passes above). `mf-specs:check`: exit 1,
  `14 specs · 1 failed · 2 issues · 13 warnings`, same two.

## Open Questions

- The orchestrator must re-run stage 3 for E002 and E003 under
  `--scope packages/specs` after this fix; until then the repo-wide check is red
  by construction.
- Should the C1/C2 diagnostics ship, or does prose stay ahead of `check`?

## Handoff

- Re-run `gate run` for E002 and E003 stage 3, then
  `check --name montflow-spec-standard`; expect `0 issues`.
- Run the remaining `GATES.md` stages at completion; stage 3 is
  `bun run --cwd packages/specs test`.
- Review focus: supersede semantics, marker coverage, contract codes versus
  current `check`.

## Deviations

- First `mf-profiles doctor` lacking `--dir "$PWD"` wrote copies under
  `packages/profiles/.agents/`; removed and rerun at the workspace root.
