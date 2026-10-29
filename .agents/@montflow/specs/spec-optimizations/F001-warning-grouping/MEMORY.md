# Memory

## Context

Task F001 (`warning-grouping`) restores signal to `mf-specs check`. The current
tree carries 91 `task.missing-size` warnings (the task text says 79; see
Findings) and printed every one as a nine-row diagnostic block — 737 lines from
`cli check --dir ../..`, 745 from `bun run mf:check:specs`.

Scope: `packages/specs` only. Requirements 157-158 in `SPEC.md`:

- `mf-specs check` groups task-size and record warnings by spec and code, with
  full detail under `--verbose`; errors still render in full and aggregate.
- The target is a `mf:check:specs` run under roughly 25 lines.

Phase E already ships the single renderer in
`packages/specs/src/modules/diagnostic/` (`DiagnosticBlock`,
`renderDiagnostic`, `renderDiagnostics`, `verbose` gates `cause` / `layers` /
`stack`). `dispatchDiagnostics` is still the one blocker list for
`status` / `next`; `renderCheck` had no grouping at all before this task, so the
new summary is additive and dispatch surfaces are untouched.

## Progress

- Added `renderIssueBlock` (one finding), `renderWarningSummary` (one line per
  warning code), and rewired `renderIssueBlocks` in
  `packages/specs/src/apps/cli/cli.apps.module.ts`:
  - errors always render in full, in discovery order, across every spec;
  - compact mode renders one `  ! <code> × <count> · <path>` line per code, in
    first-appearance order, plus the existing terse line for a legacy warning
    with no code;
  - `--verbose` renders every warning as its full block (with `cause` /
    `layers`) exactly as before, in discovery order;
  - the representative path is the lexicographically smallest path in the
    group, so the line is stable: the store reads a spec's files concurrently
    and the discovery-first path changed between runs.
- `--strict` is unchanged in `reduceCheck` (`promoteWarnings` strips the
  warning severity), so promoted findings are errors and therefore render in
  full — no grouping path can hide them.
- Updated `check --verbose` help text, `src/apps/cli/CONTEXT.md`'s `check`
  bullet, and `README.md`'s Diagnostics paragraph, all of which described the
  old "compact output is unchanged" behaviour.
- Tests (`src/apps/cli/tests/check.test.ts`, new
  `Cli.renderCheck warning grouping runtime`):
  - one code across several specs + several codes in one spec (exact output,
    counts, first-appearance order);
  - verbose expansion (every warning block present, no `×`);
  - errors keep full blocks beside groups and warnings never render as blocks in
    compact mode;
  - zero warnings renders no group and the plain summary;
  - `--strict` promotion: spec fails, `1` exit code, full error blocks, no `×`.
- Updated the one existing assertion in `sizing.test.ts` that expected the old
  full block for a compact warning (`sizing.unknown-phase`); the verbose half of
  that test now asserts the block.

## Findings

- The tree renders **91** warnings, not 79: `installation-guide` 12,
  `montflow-ci-verification` 16, `montflow-multi-reviewer` 14,
  `montflow-opencode-migration` 24, `montflow-project-structure` 20,
  `montflow-spec-standard` 5. All are `task.missing-size` on completed tasks.
  The requirement's "roughly 25 lines" still holds at 23.
- Before: `cli check --dir ../..` = 737 lines (735 from the command plus two
  `bun run` echo lines); `mf:check:specs` = 745 lines.
  After: 14 lines (12 command lines plus the two echoes); `mf:check:specs` = 23
  lines including doctor's seven.
- Grouping is only visible on `renderCheck`; `status` still prints each warning
  in full, which is correct — a `status` panel is scoped to one spec and has no
  backlog to summarize.
- The full-block renderer already prints `! <code>` for warnings
  (`diagnosticRows`), so the verbose expansion needed no diagnostic-module
  change; the module stays severity-agnostic as its `CONTEXT.md` requires.
- The tree is being edited concurrently by siblings (this run observed
  `sizing.test.ts`, `run-slash.test.ts`, `which.module.ts`,
  `catalogue.module.ts`, and `cli.apps.module.ts` changing mid-task). An early
  full-suite run failed on `renderSizingReport`'s budget label and later on
  `run-slash.test.ts`; both were gone before the recorded gate run. All gate
  evidence below is from the final, green run.

## Open Questions

- The task text's "79 warnings" is stale; the tree has 91. Counts in the
  completion record should say 91 unless the orchestrator re-measures.
- Concurrent writers share this checkout for tasks F001/F003 (and G00x). F001
  touched `cli.apps.module.ts` and `sizing.test.ts`, which F003 also edits; the
  orchestrator may want a serialization or worktree policy before the review.
  No content was lost in this run, but the risk is real.
- Representative-path choice: lexicographic minimum rather than
  discovery-first. This is not required by the task; it is a stability choice.
  If the reviewer wants "first found", it is a one-line revert.

## Handoff

- Reviewer: check (a) errors never group, including a promoted warning under
  `--strict`; (b) the count is on every group line and the summary still names
  the total; (c) verbose output is byte-identical in shape to the old blocks;
  (d) the legacy uncoded warning line is unchanged; (e) the CLI help, CONTEXT,
  and README now describe grouping. `renderCheck(report, verbose)` is still a
  pure function over `CheckReport`, so those cases can be asserted directly.
- `bun run mf:check:specs` is the fast behavioural proof; `cli check --dir ../..`
  alone is 14 lines on the current tree.
- No spec state, locks, ledgers, or other task directories were touched.

## Deviations

- Groups every coded warning, not only `task.missing-size` and record codes.
  `TASK.md` says "by spec and code" and requirement 157 says "task-size and
  record warnings"; grouping by code is a superset, one implementation, and
  keeps future warning codes short.
- Added deterministic (lexicographic-min) representative paths, a stability
  improvement beyond the minimum.
- Updated `README.md`, `src/apps/cli/CONTEXT.md`, and the `check --verbose`
  description because they documented the pre-grouping output. Documentation
  truth is inside `packages/specs`; no shipped skill or prompt changed.
- Changed one assertion in `sizing.test.ts` (compact `sizing.unknown-phase`
  rendering) and added the verbose assertion for the same finding; the old
  assertion encoded the behaviour this task replaces.

## Gate Evidence

### Stage 0: `bun run --cwd packages/specs test`

```text
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.4 /home/daniel/dev/montflow/spec-optimizations/packages/specs


 Test Files  92 passed (92)
      Tests  1195 passed (1195)
Type Errors  no errors
   Start at  19:25:10
   Duration  3.71s (import 72%, tests 19%, transform 8%, typecheck 1%, worker 1%)

    Isolate  47 workers spawned · ~150ms startup each (spawn + environment, per file)
             at least ~319ms faster with isolate: false — reuses workers across files instead of one per file
EXIT=0
```

### Stage 0: `bun run --cwd packages/specs lint:check`

```text
$ oxlint --deny-warnings .
(node:2044734) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/spec-optimizations/oxlint.config.ts?cache=1793229910172 is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:2044734) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/spec-optimizations/tooling/oxlint/anti-slop/effect/index.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/tooling/oxlint/package.json.
EXIT=0
```

### Stage 0: `bun run --cwd packages/specs format:check`

```text
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 1063ms on 159 files using 16 threads.
EXIT=0
```

### Stage 0: `bun run --cwd packages/specs ts:check`

```text
$ tsc --noEmit
EXIT=0
```

### Stage 1: `bun run mf:check:specs`

```text
$ bun run --cwd packages/specs cli check --dir $PWD && bun run --cwd packages/specs cli doctor --check --dir $PWD
$ bun run src/apps/cli/main.ts check --dir /home/daniel/dev/montflow/spec-optimizations
✓ installation-guide (12 warnings)
  ! task.missing-size × 12 · installation-guide/A001-rewrite-installation-guide/TASK.md
✓ montflow-ci-verification (16 warnings)
  ! task.missing-size × 16 · montflow-ci-verification/A001-explore-existing-ci/TASK.md
✓ montflow-multi-reviewer (14 warnings)
  ! task.missing-size × 14 · montflow-multi-reviewer/A001-explore-review-pipeline/TASK.md
✓ montflow-opencode-migration (24 warnings)
  ! task.missing-size × 24 · montflow-opencode-migration/A001-explore-pi-extension-surface/TASK.md
✓ montflow-project-structure (20 warnings)
  ! task.missing-size × 20 · montflow-project-structure/A001-explore-structural-core/TASK.md
✓ montflow-spec-standard (5 warnings)
  ! task.missing-size × 5 · montflow-spec-standard/A001-explore-verification-surface/TASK.md

8 specs · 0 failed · 0 issues · 91 warnings
$ bun run src/apps/cli/main.ts doctor --check --dir /home/daniel/dev/montflow/spec-optimizations
✓ spec skills and prompts are installed and up to date.
✓ montflow-create-specs: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-create-specs
✓ montflow-find-specs: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-find-specs
✓ spec-create: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-create.json
✓ spec-execute: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-execute.json
✓ spec-sizing: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-sizing.json
EXIT=0
```

23 lines including the two `bun run` echoes. `wc -l` = 23.

### Stage 1: `bun run --cwd packages/specs cli check --dir . --verbose --name montflow-ci-verification`

Run exactly as written. Under `bun run --cwd packages/specs`, `--dir .` is
`packages/specs`, which holds no spec store, so the command fails before
rendering:

```text
$ bun run src/apps/cli/main.ts check --dir . --verbose --name montflow-ci-verification
code     store.error
path     .agents/@montflow/specs
field    root
problem  Specs directory not found: .agents/@montflow/specs
fix      Pass --dir <repo root> (the directory holding .agents/@montflow/specs) and re-run the command.
next     mf-specs check
error: script "cli" exited with code 1
EXIT=1
```

Same intent from the repo root (`--dir ../..`), which is the store the gate
means:

```text
$ bun run --cwd packages/specs cli check --dir ../.. --verbose --name montflow-ci-verification
root ../../.agents/@montflow/specs
✓ montflow-ci-verification (16 warnings)
  code     ! task.missing-size
  path     montflow-ci-verification/A001-explore-existing-ci/TASK.md
  field    size
  problem  Completed task declares no size; sizing is advisory for historical work.
  expected tiny, small, medium, large
  actual   missing
  fix      Add `size: medium` to TASK.md frontmatter (tiny, small, medium, large).
  layers   consulted repo,spec,phase · phase A
  next     mf-specs check --name montflow-ci-verification

…15 more blocks, same shape, one per warning, 149 lines total…

  layers   consulted repo,spec,phase · phase A
  next     mf-specs check --name montflow-ci-verification

1 spec · 0 failed · 0 issues · 16 warnings
EXIT=0
```

`wc -l` = 149; every one of the 16 grouped warnings is expanded (`grep -c
'code     ! task.missing-size'` = 16, each with `path`, `fix`, `layers`, and
`next`).

### Stage 1: `bun run --cwd packages/specs cli check --dir . --strict --name montflow-spec-standard`

Run exactly as written; same `--dir .` caveat, so it fails at the store:

```text
$ bun run src/apps/cli/main.ts check --dir . --strict --name montflow-spec-standard
code     store.error
path     .agents/@montflow/specs
field    root
problem  Specs directory not found: .agents/@montflow/specs
fix      Pass --dir <repo root> (the directory holding .agents/@montflow/specs) and re-run the command.
next     mf-specs check
error: script "cli" exited with code 1
EXIT=1
```

From the repo root (`--dir ../..`), strict promotion still fails and renders
every promoted finding in full, no groups:

```text
$ bun run src/apps/cli/main.ts check --dir ../.. --strict --name montflow-spec-standard
✗ montflow-spec-standard (5)
  code     task.missing-size
  path     montflow-spec-standard/A003-add-issue-severity-channel/TASK.md
  field    size
  problem  Completed task declares no size; sizing is advisory for historical work.
  expected tiny, small, medium, large
  actual   missing
  fix      Add `size: medium` to TASK.md frontmatter (tiny, small, medium, large).
  next     mf-specs check --name montflow-spec-standard
  code     task.missing-size
  path     montflow-spec-standard/A002-explore-payload-doctor-surface/TASK.md
  field    size
  problem  Completed task declares no size; sizing is advisory for historical work.
  expected tiny, small, medium, large
  actual   missing
  fix      Add `size: medium` to TASK.md frontmatter (tiny, small, medium, large).
  next     mf-specs check --name montflow-spec-standard
  code     task.missing-size
  path     montflow-spec-standard/A099-review-phase/TASK.md
  field    size
  problem  Completed task declares no size; sizing is advisory for historical work.
  expected tiny, small, medium, large
  actual   missing
  fix      Add `size: medium` to TASK.md frontmatter (tiny, small, medium, large).
  next     mf-specs check --name montflow-spec-standard
  code     task.missing-size
  path     montflow-spec-standard/A001-explore-verification-surface/TASK.md
  field    size
  problem  Completed task declares no size; sizing is advisory for historical work.
  expected tiny, small, medium, large
  actual   missing
  fix      Add `size: medium` to TASK.md frontmatter (tiny, small, medium, large).
  next     mf-specs check --name montflow-spec-standard
  code     task.missing-size
  path     montflow-spec-standard/A004-add-artifact-reference-resolution/TASK.md
  field    size
  problem  Completed task declares no size; sizing is advisory for historical work.
  expected tiny, small, medium, large
  actual   missing
  fix      Add `size: medium` to TASK.md frontmatter (tiny, small, medium, large).
  next     mf-specs check --name montflow-spec-standard

1 spec · 1 failed · 5 issues
error: script "cli" exited with code 1
EXIT=1
```

### Line counts, before and after

```text
$ bun run --cwd packages/specs cli check --dir ../.. | wc -l
before: 737 (735 command lines + 2 bun echoes)
after:    14 (  12 command lines + 2 bun echoes)

$ bun run mf:check:specs | wc -l
before: 745
after:    23
```

Two consecutive compact runs are byte-identical (`diff` empty), so the group
path is stable.

## Orchestrator gate re-run (2026-10-28, independent of the worker)

Stage 0, all four, exit 0:

```text
$ bun run --cwd packages/specs test
 Test Files  92 passed (92)
      Tests  1195 passed (1195)
Type Errors  no errors
EXIT=0

$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
EXIT=0

$ bun run --cwd packages/specs format:check
$ oxfmt --check .
All matched files use the correct format.
Finished in 359ms on 159 files using 16 threads.
EXIT=0

$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
EXIT=0
```

Stage 1:

```text
$ bun run mf:check:specs | wc -l
23
EXIT=0
   (23 lines: 6 grouped spec summaries, 6 counts, 6 doctor lines, footer;
    was 745 lines before this task)

$ bun run --cwd packages/specs cli check --dir ../.. --verbose --name montflow-ci-verification | wc -l
149
EXIT=0
   (16 warnings expanded into full coded blocks, no groups)

$ bun run --cwd packages/specs cli check --dir ../.. --strict --name montflow-spec-standard
1 spec · 1 failed · 5 issues
EXIT=1
   (promoted warnings render as errors; unchanged)
```

`--dir .` on the two Stage 1 lines is the cwd artifact recorded in phase E (`.`
is `packages/specs` under `bun run --cwd`); both are proven at the repo root.
All gates pass. F001 completes.
