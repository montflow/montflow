# Memory

## Context

C001 implements the v2 **version and structure** contract on top of B001's
restored phase tree and B004's decisions: `SPEC.md` `spec-version`, the
`PHASE.md` record (`modules/phase`), derived phase locks that include gate proof
and the review waiver, the v2 `migrate` upgrade path, and v1/v2/future fixtures.
C002 (gate kinds/execution), C003 (mail), C004 (doctor/payload), C005 (state
verbs/live wave), C009 (review policy) are out of scope. The live store was not
migrated; C005 owns `migrate --all`.

## Progress

- 2026-11-02: read B001/B004/B005 memory, the spec/structure/lifecycle/scaffold/
  gates/migrate modules, their tests, and the fixture store.
- 2026-11-02: implemented `spec-version` (`SPEC_VERSION_FIELD`,
  `SPEC_STANDARD_VERSION=2`, previous `1`, four codes, `readSpecVersion`); absent
  and `1` warn, `2` passes, `>2` errors, non-positive/non-decimal is invalid.
- 2026-11-02: added `modules/phase` (`PHASE.md` parse/verify,
  `derivePhaseStatus`, gate-kind parsing, evidence grammar, `phaseEvidence`,
  `renderPhaseFile`/`renderPhaseMemory`) plus `PHASE.md` code set.
- 2026-11-02: extended `structure` with the v2 phase/task allowlists,
  `PHASE.md`/phase `MEMORY.md` presence, `isV2Transformed`, and
  `spec.version-untransformed`; wired `phaseEvidence` into
  `lifecycle.Input` (`waivedPhases`, `provenPhases`) and the three-way lock.
- 2026-11-02: extended `migrate` with the `upgrade` plan, generated `PHASE.md`/
  phase `MEMORY.md`, the one-line `SPEC.md` version write, `frozen` complete
  specs, `already`, per-write rollback, `SpecStore.removeFile`, and a
  version-independent transform check.
- 2026-11-02: made `create` write `spec-version: 2`, `PHASE.md`, and phase
  `MEMORY.md`; kept the reserved `*099` generator deleted and review tasks
  requested-only.
- 2026-11-02: added fixtures `mock-v1`, `mock-v2`, `mock-future`,
  `mock-untransformed` and updated fixture/CLI/spec/structure/scaffold/lifecycle/
  workspace tests for the version warning.
- 2026-11-02: ran every gate below. All five exit 0: package tests (102 files,
  1451 tests), `mf-specs:check` (14 specs, 0 issues, 14 version warnings),
  `ts:check`, `lint:check`, and `fmt:check`. During the run, concurrent C004's
  in-flight payload/doctor files were transiently red; they went green before
  the final gate pass.

## Findings

### Version

- `readSpecVersion(fields)` returns `{ version, declared, issues }`. Absent and
  declared `1` read as `1` with `spec.version-outdated` (warning); `2` is clean;
  an integer above `2` keeps its value and emits `spec.version-future` (error);
  a non-decimal, `0`, or negative value falls back to `1` and emits
  `spec.version-invalid` (error). The field is deliberately not in the `Spec`
  schema, so an invalid value never deletes the descriptor from consumers.

### Phase record

- `modules/phase` owns `PHASE.md`: `id` must equal the directory, `objective`
  is non-empty and not a placeholder, `status` must equal
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
  Results parsing is intentionally minimal; C002 owns `gate run`/`gate record`
  and can extend the same reader.

### Structure and locks

- v2 phase allowlist: `PHASE.md`, `MEMORY.md`, `GATES.md`,
  `GATE-RESULTS.jsonl`, `BOARD.md`. Task allowlist adds `MAILBOX.md` and
  `GATE-RESULTS.jsonl`.
- `isV2Transformed` is version-independent: every phase has a matching
  `PHASE.md`, no root task directory, and both allowlists hold. `verifySpecTree`
  emits `spec.version-untransformed` when `spec-version >= 2` and the predicate
  fails.
- The lock is still never stored. `phaseSummaries` now locks on
  `complete AND proven AND (closed round OR effective waiver)`; v1 phases with
  only unclassified task gates are vacuously proven, so B001 behaviour is
  unchanged.
- The B001 delete list stayed deleted: no stored lock list, no required `*099`
  review task, no scaffold reservation. `create` writes no `*099` and a review
  task appears only when requested.

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
  flag and the live `--all` wave. The engine option exists for it.

## Gates

All commands run from the repo root on 2026-11-02.

### `bun run --cwd packages/specs test -- --run`

Exit code: 0.

```
 Test Files  102 passed (102)
      Tests  1451 passed (1451)
Type Errors  no errors
```

### `bun run mf-specs:check`

Exit code: 0.

```
14 specs · 0 failed · 0 issues · 14 warnings
✓ spec skills and prompts are installed and up to date.
✓ montflow-create-specs: up to date
✓ montflow-find-specs: up to date
✓ spec-create: up to date
✓ spec-execute: up to date
✓ spec-sizing: up to date
```

Every warning is `spec.version-outdated`, one per v1 spec. No live-store
migration was run.

### `bun run ts:check`

Exit code: 0.

```
 Tasks:    17 successful, 17 total
Cached:    0 cached, 17 total
```

### `bun run lint:check`

Exit code: 0.

```
@montflow/specs:lint:check: Found 0 warnings and 0 errors.
@montflow/payload:lint:check: Found 0 warnings and 0 errors.
@montflow/profiles:lint:check: Found 0 warnings and 0 errors.
@montflow/prompts:lint:check: Found 0 warnings and 0 errors.
@montflow/skills:lint:check: Found 0 warnings and 0 errors.
 Tasks:    17 successful, 17 total
```

### `bun run fmt:check`

Exit code: 0.

```
 Tasks:    17 successful, 17 total
Cached:    17 cached, 17 total
  Time:    31ms >>> FULL TURBO
```

## Open Questions

- None blocking C001. `phase.evidence-unresolved`/`phase.waiver-unproven` use a
  minimal JSONL reader; C002's `gate run`/`gate record` should own the full
  record validation and may move that parser into `modules/gates/results.ts`.
- None on the final gate pass. Earlier root lint/format failures were entirely
  in C004's in-flight files and cleared before handoff.

## Handoff

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
- Did not touch `packages/specs/src/modules/doctor/`, payload manifests, or
  `packages/payload/`; those were C004's concurrent work. They were transiently
  red during the run and green on the final gate pass.
- Formatted two pre-existing WIP files (`packages/specs/package.json`,
  `packages/specs/src/apps/cli/cli.shared.module.ts`) only to keep the package
  format gate green; no content changed.
- `phaseEvidence` parses results just enough to derive `waived`/`proven`; the
  canonical result contract stays C002's.
