# Memory

## Context

C001 implements the v2 **version and structure** contract on top of B001's
restored phase tree and B004's decisions: the `SPEC.md` `spec-version` field,
the `PHASE.md` record (`modules/phase`), derived phase locks that include gate
proof and the review waiver, the v2 `migrate` upgrade path, and v1/v2/future
fixtures. C002 (gate kinds/execution), C003 (mail), C004 (doctor/payload), C005
(state verbs/live wave), C009 (review policy) are out of scope. The live store
was not migrated; C005 owns `migrate --all`.

2026-11-03: a prior run left this implementation committed on
`feat/spec-standard` but did not finish bookkeeping. This run re-verified the
tree, re-ran every gate from the repo root, and replaced the prior memory with
measured evidence. Working tree was clean (`git status --short` empty) before
and after this run.

## Progress

- 2026-11-03: read `TASK.md`, `GATES.md`, and the prior `MEMORY.md` as a claim to
  verify. No `BOARD.md` or `MAILBOX.md` exists for this phase/spec; nothing was
  broadcast (orchestrator instruction limits writes to this `MEMORY.md`).
- 2026-11-03: confirmed `packages/specs/src/modules/phase/phase.module.ts` exists
  with `parsePhaseFile`, `verifyPhaseFile`, `derivePhaseStatus`,
  `parsePhaseGateStages`, `phaseEvidence`, `renderPhaseFile`,
  `renderPhaseMemory`, and the `PHASE_CODES` set.
- 2026-11-03: confirmed `spec.module.ts` carries `SPEC_VERSION_FIELD`,
  `SPEC_STANDARD_VERSION = 2`, `SPEC_STANDARD_PREVIOUS = 1`, the four
  `SPEC_VERSION_CODES`, and `readSpecVersion`.
- 2026-11-03: confirmed `structure.module.ts` wires `readSpecVersion`,
  `isV2Transformed`, `spec.version-untransformed`, the v2 phase/task
  allowlists, and `phaseEvidence`.
- 2026-11-03: confirmed `migrate` supports `migrate` (flat moves), `upgrade`,
  `already`, `frozen`, and `refused`, writing `PHASE.md`/phase `MEMORY.md` then
  `SPEC.md` last.
- 2026-11-03: confirmed `scaffold`/`create` write `spec-version: 2`, `PHASE.md`,
  and phase `MEMORY.md`, and emit no reserved `*099` task and no unconditional
  review task.
- 2026-11-03: exercised the behaviours end-to-end with the real CLI on throwaway
  stores under `/tmp/opencode` (fixtures in the repo were read, not written):
  v1/v2/future/untransformed checks, flat-v1 migrate, phase-tree v1 upgrade,
  idempotent second migrate, `create` with and without a requested review task,
  and a deliberately broken `PHASE.md`.
- 2026-11-03: ran all five gate commands fresh. All exit 0.

## Findings

### Version

- `readSpecVersion(fields)` returns `{ version, declared, issues }`. Absent and
  declared `1` read as `1` with `spec.version-outdated` (warning); `2` is clean;
  an integer above `2` keeps its value and emits `spec.version-future` (error);
  a non-decimal, `0`, or negative value falls back to `1` and emits
  `spec.version-invalid` (error). The field is deliberately not in the `Spec`
  schema, so an invalid value never deletes the descriptor from consumers.
- `verifySpecTree` emits `spec.version-untransformed` when `spec-version >= 2`
  but `isV2Transformed` fails, so a bare version bump without the phase tree is
  rejected.

### Phase record

- `modules/phase` owns `PHASE.md`: `id` must equal the directory, `objective`
  must be non-empty and free of `<` placeholders, `status` must equal
  `derivePhaseStatus(tasks)`, `review` is `required|waived`, `review-reason` is
  required iff waived and forbidden when required, `review-evidence` is
  forbidden when required, and `gate` is `none|mechanical|subjective`.
- A phase `GATES.md` must classify every stage with exactly the declared `gate`
  kind; a required phase with no review task is only a **warning**
  (`phase.review-task-missing`); a waived phase with a review task is an error.
- Evidence refs are `phase:<n>` or `<task-id>:<n>`; malformed, duplicate, and
  foreign refs are `phase.evidence-invalid`. `phaseEvidence` resolves refs
  against classified stages and `GATE-RESULTS.jsonl`, derives `waived` and
  `proven`, and reports `phase.evidence-unresolved`/`phase.waiver-unproven`.
  Results parsing is intentionally minimal; C002 owns `gate run`/`gate record`.
- End-to-end wiring was proven: removing `PHASE.md`'s `id`, setting a stale
  status, and setting `review: maybe` produced
  `spec.version-untransformed`, `phase.status-stale`, and `phase.review-invalid`
  with `check` exit 1 on a copied v2 fixture.

### Structure and locks

- v2 phase allowlist: `PHASE.md`, `MEMORY.md`, `GATES.md`,
  `GATE-RESULTS.jsonl`, `BOARD.md`. Task allowlist adds `MAILBOX.md` and
  `GATE-RESULTS.jsonl`.
- `isV2Transformed` is version-independent: every phase has a matching
  `PHASE.md`, no root task directory, and both allowlists hold.
- The lock is still never stored. `phaseSummaries` locks on
  `complete AND proven AND (closed round OR effective waiver)`; v1 phases with
  only unclassified task gates are vacuously proven, so B001 behaviour is
  unchanged. `phase.test.ts` has the explicit case "derives the same locks an
  explicit lock list would name".
- The B001 delete list stayed deleted: no stored lock list, no required `*099`
  review task, no scaffold reservation. `grep` over `src` finds `099` only in
  test fixtures and one illustrative doc comment (`review-link`), never in a
  rule. `create` writes no `*099`; a review task appears only when requested.

### Migrate

- `planMigration` returns `migrate` (flat moves), `upgrade` (phase tree),
  `already` (v2 transformed), `frozen` (complete, unless `includeComplete`), or
  `refused` (mixed tree, stray file, future/invalid version, no tasks).
- `planUpgrade` writes only missing `PHASE.md`/phase `MEMORY.md`, derives the
  phase status and gate kind, always sets `review: required`, then writes
  `spec-version: 2` last. A pre-existing `PHASE.md` is never repaired.
- Writes happen phase-first and `SPEC.md` last; a post-write verification
  failure restores the original `SPEC.md`, deletes only files this run created,
  and reverses the moves. A second run is `already`.
- `migrate --include-complete` is not wired as a CLI flag here; C005 owns the
  flag and the live `--all` wave.

## Gates

All commands run from the repo root on 2026-11-03. Logs were captured under
`/tmp/opencode/c001-gates/`; the excerpts below are verbatim from those logs.

### `bun run --cwd packages/specs test -- --run`

Exit code: 0.

```
 Test Files  102 passed (102)
      Tests  1451 passed (1451)
Type Errors  no errors
```

Includes `packages/specs/src/modules/phase/tests/phase.test.ts` (16 cases:
derive, verify, gate kind, title, and evidence/lock derivation) and
`packages/specs/src/apps/cli/tests/fixtures.test.ts` (v1/v2/future/
untransformed).

### `bun run mf-specs:check`

Exit code: 0.

```
14 specs · 0 failed · 0 issues · 14 warnings
$ bun run src/apps/cli/main.ts doctor --check --dir /home/daniel/dev/montflow/spec-standard
✓ spec skills and prompts are installed and up to date.
✓ montflow-create-specs: up to date → /home/daniel/dev/montflow/spec-standard/.agents/skills/montflow-create-specs
✓ montflow-find-specs: up to date → /home/daniel/dev/montflow/spec-standard/.agents/skills/montflow-find-specs
✓ spec-create: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/prompts/spec-create.json
✓ spec-execute: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/prompts/spec-execute.json
✓ spec-sizing: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/prompts/spec-sizing.json
```

Every warning is `spec.version-outdated`, one per v1 live spec. No live-store
migration was run.

### `bun run ts:check`

Exit code: 0.

```
@montflow/workspace:ts:check: $ tsc --noEmit

 Tasks:    17 successful, 17 total
Cached:    17 cached, 17 total
  Time:    23ms >>> FULL TURBO
```

### `bun run lint:check`

Exit code: 0.

```
@montflow/format:lint:check: Found 0 warnings and 0 errors.
@montflow/model-fallback:lint:check: Found 0 warnings and 0 errors.
@montflow/core:lint:check: Found 133 warnings and 0 errors.
 Tasks:    17 successful, 17 total
Cached:    17 cached, 17 total
  Time:    25ms >>> FULL TURBO
```

Note: `@montflow/core` reports 133 pre-existing warnings (anti-slop rules in
`src/modules/number-ext` and related). They are not in specs and do not fail
the gate; the prior memory's claim of "0 warnings" for every package was
inaccurate.

### `bun run fmt:check`

Exit code: 0.

```
@montflow/stlx:format:check: Finished in 1134ms on 7 files using 16 threads.

 Tasks:    17 successful, 17 total
Cached:    17 cached, 17 total
  Time:    22ms >>> FULL TURBO
```

## Completion evidence

- v1/v2/future (real CLI, repo fixture store):
  - `check --name mock-v1`: `✓ mock-v1 (1 warning)` `! spec.version-outdated`,
    `1 spec · 0 failed · 0 issues · 1 warning`, exit 0.
  - `check --name mock-v2`: `1 spec · 0 failed · 0 issues`, exit 0.
  - `check --name mock-future`: `✗ mock-future (1)` with
    `code spec.version-future ... actual 3`, exit 1.
  - `check --name mock-untransformed`: `spec.version-untransformed` plus
    `phase.missing`/`phase.memory-missing`, exit 1.
- Flat-v1 migrate (throwaway `/tmp/opencode/c001-flat2`, spec `ship-login` with
  A001 execution + A002 review): `migrate --name ship-login` reported
  `moved 'A001-implement-login' -> 'A/A001-implement-login'`,
  `moved 'A002-review-phase' -> 'A/A002-review-phase'`, `wrote 'A/PHASE.md'`,
  `wrote 'A/MEMORY.md'`, `wrote 'SPEC.md'`, `1 spec · 1 migrated · ... 0 failed`,
  exit 0. A following `check --name ship-login` reported
  `1 spec · 0 failed · 0 issues`, exit 0.
- Phase-tree v1 upgrade (throwaway `/tmp/opencode/c001-upgrade`, copy of
  `mock-v1`): `migrate` reported `✓ v1tree (upgraded)` with the three writes,
  exit 0; `check` reported `0 failed · 0 issues` plus one
  `phase.review-task-missing` warning (the fixture has no review task), exit 0;
  a second `migrate` reported `already on the v2 phase tree`, exit 0.
- `create` (throwaway `/tmp/opencode/c001-create`):
  - `create --name demo-plain` produced `A/A001-implement`, no `*099`, and no
    review task; `check` exited 0 with only `phase.review-task-missing`.
  - `create --name demo-review --tasks 'implement,review-phase:review'` produced
    `A/A002-review-phase` typed `review`; `check` exited 0 with `0 issues`.
  - `grep -rn '099'` over both created trees returned nothing.
- Package tests include the phase-module tests: 102 files / 1451 tests, exit 0.
- `mf-specs:check`: `14 specs · 0 failed · 0 issues · 14 warnings`, exit 0.
- `ts:check`, `lint:check`, `fmt:check`: all exit 0.

## Open Questions

- None blocking C001. `phase.evidence-unresolved`/`phase.waiver-unproven` use a
  minimal JSONL reader; C002's `gate run`/`gate record` should own the full
  record validation and may move that parser into `modules/gates/results.ts`.
- Non-blocking observation: `verifyPhaseFile` treats an objective as a
  placeholder only when it is empty or contains `<`. A literal `TODO: ...`
  (no angle brackets), which `migrate` writes as the upgrade placeholder, is
  accepted. This satisfies TASK.md's "objective" field requirement but does not
  match the prior memory's broader "not a placeholder" claim. If the intent is
  to reject bare `TODO`, that is a small follow-up; it was not changed here to
  avoid scope creep.

## Handoff

- Orchestrator: all completion items and gates have fresh evidence above; the
  task is ready to be recorded complete. No repo files were changed by this
  verification run.
- C002: extend the gate parser with `command:`/`judge:` metadata, full
  `GATE-RESULTS.jsonl` validation, and `gate.unproven`/`gate.unjudged`; reuse
  `phaseEvidence` for the lock input.
- C005: add `migrate --include-complete`, then run `migrate --all` over
  `.agents/@montflow/specs`; the engine and rollback are proven on fixtures.
- C007: all 14 live specs currently read v1 and warn; record them as upgraded or
  frozen after C005's wave.
- C008: surface `PHASE.md` review/gate in `status`/`state`/`next`; the inputs
  (`phaseEvidence` -> `waivedPhases`/`provenPhases`) are already wired.

## Deviations

- Did not run `migrate --all` on the live store (C005 owns it).
- Did not edit any source, fixture, spec state, lock, or other task file. Only
  this `MEMORY.md` was written; all behavioural checks used copies under
  `/tmp/opencode`.
- Did not create a `BOARD.md` entry: no board exists and the orchestrator
  limited writes to this task's memory.

## Orchestrator Verification (2026-11-03)

Independent gate run from the repo root after the worker receipt:

```
$ bun run --cwd packages/specs test -- --run
 Test Files  102 passed (102)
      Tests  1451 passed (1451)
Type Errors  no errors
EXIT=0

$ bun run mf-specs:check
14 specs · 0 failed · 0 issues · 14 warnings
EXIT=0

$ bun run mf:gate:fast   # lint:check + fmt:check + ts:check + mf:check
 Tasks:    17 successful, 17 total   (lint)
 Tasks:    17 successful, 17 total   (format)
 Tasks:    17 successful, 17 total   (ts)
summary checks=8 failed=0 repaired=0
EXIT=0

$ check --name mock-v1      -> 1 spec · 0 failed · 0 issues · 1 warning, EXIT=0
$ check --name mock-v2      -> 1 spec · 0 failed · 0 issues, EXIT=0
$ check --name mock-future  -> spec.version-future, 1 failed · 1 issue, EXIT=1
$ check --name mock-untransformed -> spec.version-untransformed, 1 failed · 3 issues, EXIT=1

static: no REVIEW_NUMBER/reviewId in packages/specs/src; no locked-phases reads
```

All completion items are supported by the evidence above; task recorded complete
by the orchestrator.
