# Memory

## Context

Task C002: enforce the phase-directory layout. Contract source: B001 §1–§6. This
task also absorbed C004's scaffold/CLI path work (see Deviations): a layout check
cannot land green while `mf-specs create` still emits a flat tree.

## Progress

- 2026-10-28: complete. Package suite 56 files / 424 tests green; lint, format,
  typecheck clean; repo store 0 errors / 120 legacy warnings; fixtures match
  their documented verdicts.

## Findings

### 1. Walk (`structure.module.ts`)

- Helpers: `parentOf`, `baseOf`, `directoryPaths` (declared directory entries ∪
  file-path parents), and a `childrenOf(dir)` over that set.
- Root: files must be `SPEC.md`; directories are phase dirs (`PHASE_PATTERN`) or
  findings. A root task directory is F1, a **warning** with
  `Task directory '<dir>' must live inside a phase directory: <phase>/<dir>/.`
  and `fix: Move it to <phase>/<dir>/.`.
- Files deeper than three segments are F8; any directory inside a task
  directory is F6, including the implied parent of a deep file (that subtree
  then reports both F6 and F8; the duplicate pair is accepted).
- Phase: no files (F4), at least one task directory (F5), task dirs sorted by
  phase. Task: F7 when the id letters disagree with the phase directory; the
  leaf name is passed to `verifyTaskFile`.
- `locked-phases` and the one-`review`-per-phase check run over the known phases
  (phase dirs plus legacy phases), so a legacy tree keeps verifying.
- `nest` still spreads the original finding, so `severity`, `fix`, and `line`
  survive.
- **Legacy tolerance is not warning-only by accident:** the legacy root task
  directories are walked by the same `readTaskDir` reader as phase tasks. Without
  that, a legacy tree would lose every task and produce table/lifecycle errors,
  not warnings. D003 deletes the legacy branch (both the F1 warning and the
  `legacyDirs` walk).

### 2. Fixtures

- `mock-ok`, `mock-complete`, `mock-stale`, and `mock-bad` moved with `git mv`
  into `<PHASE>/` directories, preserving bytes.
- `fixtures.test.ts` fields are phase-prefixed
  (`A/A002-explore-thing/MEMORY.md`, `B/B002-gated-thing/GATES.md: …`).
- `fixtures:check`: 4 specs, 2 failed (`mock-bad` 10, `mock-stale` 1) — the
  documented verdicts. `fixtures/README.md` is D002's.

### 3. Writers

- `scaffold.renderSpecScaffold` writes `${phase}/${id}-<name>/{TASK,MEMORY,GATES}.md`;
  `SPEC.md` stays at the root; `ScaffoldResult`/`ScaffoldReport` shape unchanged.
- `cli.gatedTaskIds` reads the middle segment of a three-segment
  `<phase>/<task>/GATES.md`; `summarize`, `renderStatus`, `renderNext` unchanged.
- CLI/scaffold tests updated to the phase-prefixed paths.

### 4. Tests added

Directory entries change nothing; unexpected root directory (F2); empty phase
directory (F5); file in a phase directory (F4); directory in a task directory
(F6); phase-letter mismatch (F7); deep path (F8); legacy root task directory
warns and the whole tree still verifies (F1). Existing 20 cases kept their
verdicts with phase-prefixed paths; the locked-phase and placement-hint expected
strings were updated.

### 5. Gates

- `bun run --cwd packages/specs test` — 56 files / 424 tests, no type errors.
- `bun run --cwd packages/specs lint:check` — clean.
- `bun run --cwd packages/specs format:check` — clean after `format:fix`.
- `bun run --cwd packages/specs ts:check` — clean.
- `bun run --cwd packages/specs fixtures:check` — documented verdicts.
- `bun run mf:check:specs` — 7 specs, 0 failed, 0 issues, 120 warnings (the six
  legacy trees plus this spec, which is itself still flat until D001).

## Open Questions

- None.

## Handoff

- C003 adds the `migrate` verb; D001 runs it over six trees (this spec included);
  D002 adds `mock-legacy`/`mock-stray`; D003 deletes the legacy walk and flips F1
  to an error.

## Deviations

- Absorbed C004 (`implement-scaffold-and-cli-paths`): the strict walk makes every
  freshly scaffolded flat tree warn, so the scaffold and `gatedTaskIds` had to
  change in the same task to keep the package suite green. C004 was removed from
  the spec; C099 now depends on C001–C003.
- The legacy tree is walked, not just warned about, for the reason in §1; this is
  the migration tolerance B001 §3 intended.
