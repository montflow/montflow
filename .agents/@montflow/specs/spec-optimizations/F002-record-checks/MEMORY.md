# Memory

## Context

Task F002 (`record-checks`) makes two record contradictions visible and turns
the phase review-cycle budget into a mechanical check.

Scope: `packages/specs` only. The relevant `SPEC.md` requirements are **171-173**
(record warnings group through F001's renderer; a complete task with unchecked
completion or an all-unchecked gate warns; a phase review over its size-derived
budget is an error; the budget is verified from the review series, not only the
execute prompt). The orchestrator note named "requirements 157-159", which are
the sizing-prompt clauses; they do not describe this task. See Open Questions.

Constraints honored: no historical record was rewritten; the real
`.agents/@montflow/specs/**` tree and every status/lock/ledger are untouched by
this task (the only diff under that tree from this run is this file). All tests
use synthetic fixtures under `packages/specs/fixtures/`.

Starting state (F001/F003/E complete): `packages/specs/src/modules/diagnostic/`
is the single renderer, `renderCheck` groups warning findings by spec and code,
`GUARD_RERUN` / `dispatchDiagnostics` are the single dispatch tables.

## Progress

- `task.completion-unchecked` (warning): `verifyTaskCompletion` in
  `modules/task` counts the `## Completion` checklist of a `complete` task. One
  warning per task file, message and `actual` carry the unchecked count,
  `expected` and `fix` name the repair. `verifyTaskFile` calls it after the
  size rule.
- `gate.unchecked` (warning): `verifyGateProgress` in `modules/gates` warns when
  a `complete` task's `GATES.md` has items and none checked. `parseGates` now
  keeps `{ text, checked }` per item; `Gates` still verifies the file shape.
- `review.budget-exceeded` (error): `ReviewLink.verifyBudgets` counts rounds
  attributed to each phase (`- Phase:` inside a round's `## Metadata`, via the
  new pure `ReviewLink.roundPhase`) and fails a series over that phase's budget.
  `structure` derives `PhaseBudget[]` from `phaseReviewBudget` over each phase's
  non-review task sizes and calls it whenever review series are supplied.
- Disk path: `SpecStore.reviewSeries(root, name)` reads the review store beside
  the specs store (`<specs-root>/../reviews`) for `<name>` and `<name>-<profile>`
  series, returning `{ round, phase }` snapshots. A missing `reviews` directory
  yields no series (historical specs stay green); an unreadable one fails, so
  the budget check is never silently skipped. `check` passes the snapshots to
  `verifySpecTree` with `{ series, requireRounds: false }`: the budget applies,
  but a missing series does not become an error (the F17 rule).
- Rendering: `renderWarningSummary` now renders every coded warning group for a
  spec on **one** line (`code × count · path · …`). New codes therefore cost no
  extra lines per spec. Errors and `--verbose` are unchanged.
- Scaffold: `mf-specs create`'s `GATES.md` stub is now the single item
  `- [ ] REPLACE with this task's own verification commands` (no copied
  repo-wide suite).
- Authoring skill `packages/specs/skills/montflow-create-specs/` (v2.10.0 +
  CHANGELOG entry) gains "A Gate Names the Task's Own Commands" and states the
  two record warnings plus the mechanical review budget. The workspace mirror
  `.agents/skills/montflow-create-specs/` was rewritten by `mf-specs doctor` and
  is byte-identical; the embedded payload was regenerated.
- Fixtures: `mock-history` (untouched record, series exactly at budget → clean)
  and `mock-over-budget` (four rounds for a `tiny` phase → one budget error),
  plus `fixtures/.agents/@montflow/reviews/` for both. `fixtures/README.md`
  documents them.
- Docs updated for truth: `packages/specs/README.md` (check bullet, diagnostics,
  library surface), `src/apps/cli/CONTEXT.md`, and the module CONTEXTs for
  `task`, `gates`, `structure`, `review-link` (new), and `spec-store`.
- Tests added: task completion rule (warn vs pending/checked), gate progress
  (warn vs pending/partly-checked/itemless), `roundPhase`, `verifyBudgets`
  (at budget, over budget with exact message, per-phase counting, skips),
  `check` integration (grouped record warnings, untouched history, at/over
  budget through the stub store), fixtures (real disk review store), scaffold
  marker, and the packaged skill prose.

## Findings

- `mf:check:specs` is **27 lines** on the current tree (F001 left it at 23):
  2 script echoes + 1 check echo + 8 spec header lines + 8 one-line warning
  groups + blank + footer + 1 doctor echo + 6 doctor lines. Each spec
  contributes exactly one warning line whatever its code count; the increase
  comes from `plugin-host-integration` and `spec-optimizations` now having
  record warnings (2 extra specs), not from per-code multiplication.
- The tree now reports 227 warnings (91 before), 0 errors: 91
  `task.missing-size`, plus `task.completion-unchecked` and `gate.unchecked` on
  historical complete tasks. All are warnings, so every historical spec stays
  `✓` and `mf:check:specs` exits 0.
- Real budget proof without editing records: a `/tmp/opencode/f002-real` copy of
  `.agents/` is green for `spec-optimizations` (phase E holds 3 rounds in both
  series at budget 3); adding a synthetic `008/REVIEW.md` with `- Phase: E` to
  that copy fails with `series 'spec-optimizations' holds 4 rounds ... budget
  is 3`. Evidence below.
- `ReviewLink.verify` (missing series/round) stays opt-in
  (`requireRounds: true`); wiring it into `check` would turn every historical
  spec with a complete review task and no series red, contradicting F17's
  contract.
- Adding `reviewSeries` to the `SpecStore` interface meant every hand-built
  store stub needed one line. That includes
  `src/apps/cli/tests/validate-names.test.ts`, which is a sibling task's new
  (untracked) file, and `list.test.ts` / `check.test.ts` helpers. Only the
  service shape line was added; no assertion there was changed.
- A task with no `GATES.md`, and an itemless `GATES.md`, stay
  `verifyGatesFile`'s business; `gate.unchecked` only fires on a complete task
  whose gate has items and no check.
- The completion census ignores `###` subheadings but stops at the next `##`,
  so nested checklists inside `## Completion` are counted.

## Open Questions

- The orchestrator's "requirements 157-159" are the sizing-prompt clauses; the
  record/budget requirements are 171-173 in `SPEC.md`. No action taken; naming
  it here so the phase record can correct the pointer.
- Line target: F001's "roughly 25" is now 27 because two more specs legitimately
  warn. Dropping the spec header into the warning line would reach 19 but costs
  the per-spec `✓` header. Kept 27; the reviewer may prefer the denser form.
- `status --name spec-optimizations` still prints every warning as a full block
  (F001's deliberate scope: a status panel is one spec). With 50 record
  warnings it is now long. Out of this task's scope; candidate for a later nit.
- Should a spec whose review series is *absent* while its review task is
  complete be flagged? Today it is not (historical compatibility). The link
  check still supports strict mode for callers that supply series deliberately.

## Handoff

- Reviewer: check (a) both new warnings fire only on `status: complete`;
  (b) the grouped line still carries every code with its count and one stable
  path; (c) `check` reads the real review store and a fourth `- Phase: E` round
  fails while the current three stay green; (d) no historical record or spec
  state changed; (e) package skill, workspace mirror, and embedded payload
  agree (`mf:check:skills` and `mf:check:specs` green); (f) the scaffold stub
  marker is present and still yields a valid tree.
- The F17 test (`passes a no-profile spec with a completed review and no
  series`) is the regression guard for not tightening `check`.
- `bun run mf:check:specs` is the fast behavioural proof; `cli check --dir
  fixtures` shows the synthetic at/over-budget fixtures.

## Deviations

- One grouped warning line per spec instead of one line per code: needed to keep
  `mf:check:specs` near F001's line target once every spec carries up to three
  codes. Counts and the representative path are preserved per code; `--verbose`
  still expands every finding to its full block. F001's two exact-output
  assertions were updated to the combined line, and its synthetic
  `record.unchecked-completion` code was renamed to the real
  `task.completion-unchecked`.
- `verifySpecTree`'s second parameter is now `ReviewInput`
  (`{ series, requireRounds }`) instead of a bare series array, so the
  disk-driven `check` can enable the budget check without enabling the strict
  link check. Two structure tests were updated to the object form.
- `SpecStore` gained `reviewSeries`, and every test stub implementing the
  service was extended. This keeps review reading behind the one store seam
  instead of adding a second service and layer wiring.
- The shared `taskMarkdown` test helper now defaults the completion box to
  checked for `status: complete` (and offers a `completion` override); otherwise
  every existing complete-task fixture would have grown an intentional warning.
- New fixtures and new `review-link/CONTEXT.md` are additive; no existing
  fixture's expected verdict changed except that `fixtures:check` now also fails
  `mock-over-budget` (it already exited 1 for `mock-bad`/`mock-stale`).

## Gate Evidence

### Stage 0: `bun run --cwd packages/specs test`

Command run from the repo root. Output:

```text
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.4 /home/daniel/dev/montflow/spec-optimizations/packages/specs


 Test Files  92 passed (92)
      Tests  1227 passed (1227)
Type Errors  no errors
   Start at  20:07:35
   Duration  2.97s (import 79%, tests 15%, transform 5%, typecheck 1%)
EXIT=0
```

### Stage 0: `bun run --cwd packages/specs lint:check`

```text
$ oxlint --deny-warnings .
(node:2273834) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/spec-optimizations/oxlint.config.ts?cache=1793232458071 is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:2273834) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/spec-optimizations/tooling/oxlint/anti-slop/effect/index.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/tooling/oxlint/package.json.
EXIT=0
```

### Stage 0: `bun run --cwd packages/specs format:check`

```text
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 422ms on 176 files using 16 threads.
EXIT=0
```

### Stage 0: `bun run --cwd packages/specs ts:check`

```text
$ tsc --noEmit
EXIT=0
```

### Stage 1: `bun run --cwd packages/specs cli check --dir . --name spec-optimizations`

Run exactly as written. Under `bun run --cwd packages/specs`, `--dir .` is
`packages/specs`, which holds no spec store, so the command fails before
rendering (same artifact phase E and F001 recorded):

```text
$ bun run src/apps/cli/main.ts check --dir . --name spec-optimizations
code     store.error
path     .agents/@montflow/specs
field    root
problem  Specs directory not found: .agents/@montflow/specs
fix      Pass --dir <repo root> (the directory holding .agents/@montflow/specs) and re-run the command.
next     mf-specs check
error: script "cli" exited with code 1
EXIT=1
```

Same intent from the repo root, which is the store the gate means:

```text
$ bun run src/apps/cli/main.ts check --dir ../.. --name spec-optimizations
✓ spec-optimizations (50 warnings)
  ! task.completion-unchecked × 27 · spec-optimizations/A001-contract/TASK.md · gate.unchecked × 23 · spec-optimizations/A001-contract/GATES.md

1 spec · 0 failed · 0 issues · 50 warnings
EXIT=0
```

Both record codes appear in the grouped form; the same line is the one the
full-tree run emits.

### Stage 1: a synthetic series with four rounds for a tiny phase fails with the budget and count

Fixture `mock-over-budget` (phase A tasks are `tiny`, so budget 1; the series
holds four rounds attributed to A):

```text
$ bun run --cwd packages/specs cli check --dir fixtures --name mock-over-budget
$ bun run src/apps/cli/main.ts check --dir fixtures --name mock-over-budget
✗ mock-over-budget (1)
  code     review.budget-exceeded
  path     mock-over-budget
  field    review-series
  problem  Review series 'mock-over-budget' holds 4 rounds attributed to phase 'A'; the phase budget is 1.
  expected at most 1 round for phase 'A'
  actual   4 rounds
  fix      Do not open another round in 'mock-over-budget'; escalate the remaining findings. The budget is the largest non-review task size in phase 'A'.
  next     mf-specs check --name mock-over-budget

1 spec · 1 failed · 1 issue
error: script "cli" exited with code 1
EXIT=1
```

### Stage 1: a synthetic series exactly at budget stays green

Fixture `mock-history` (untouched complete record, checked boxes and gate,
series at phase A's budget of 1):

```text
$ bun run --cwd packages/specs cli check --dir fixtures --name mock-history
$ bun run src/apps/cli/main.ts check --dir fixtures --name mock-history
1 spec · 0 failed · 0 issues
EXIT=0
```

### Stage 1: the real phase E series is at budget, and a fourth round fails

A `/tmp/opencode/f002-real` copy of `.agents/` (no real record edited). At
budget, both series hold 3 rounds attributed to E:

```text
$ bun run src/apps/cli/main.ts check --dir /tmp/opencode/f002-real --name spec-optimizations
✓ spec-optimizations (50 warnings)
  ! task.completion-unchecked × 27 · spec-optimizations/A001-contract/TASK.md · gate.unchecked × 23 · spec-optimizations/A001-contract/GATES.md

1 spec · 0 failed · 0 issues · 50 warnings
EXIT=0
```

Adding a synthetic `spec-optimizations/008/REVIEW.md` with `- Phase: E` to that
copy:

```text
$ bun run src/apps/cli/main.ts check --dir "/tmp/opencode/f002-real" --name spec-optimizations
✗ spec-optimizations (1 issue · 50 warnings)
  code     review.budget-exceeded
  path     spec-optimizations
  field    review-series
  problem  Review series 'spec-optimizations' holds 4 rounds attributed to phase 'E'; the phase budget is 3.
  expected at most 3 rounds for phase 'E'
  actual   4 rounds
  fix      Do not open another round in 'spec-optimizations'; escalate the remaining findings. The budget is the largest non-review task size in phase 'E'.
  next     mf-specs check --name spec-optimizations
  ! task.completion-unchecked × 27 · spec-optimizations/A001-contract/TASK.md · gate.unchecked × 23 · spec-optimizations/A001-contract/GATES.md

1 spec · 1 failed · 1 issue · 50 warnings
error: script "cli" exited with code 1
EXIT=1
```

### `bun run mf:check:specs` (F001's line target)

```text
$ bun run --cwd packages/specs cli check --dir $PWD && bun run --cwd packages/specs cli doctor --check --dir $PWD
$ bun run src/apps/cli/main.ts check --dir /home/daniel/dev/montflow/spec-optimizations
✓ installation-guide (24 warnings)
  ! task.missing-size × 12 · installation-guide/A001-rewrite-installation-guide/TASK.md · task.completion-unchecked × 12 · installation-guide/A001-rewrite-installation-guide/TASK.md
✓ montflow-ci-verification (21 warnings)
  ! task.missing-size × 16 · montflow-ci-verification/A001-explore-existing-ci/TASK.md · gate.unchecked × 5 · montflow-ci-verification/C001-add-extension-verify-commands/GATES.md
✓ montflow-multi-reviewer (23 warnings)
  ! task.missing-size × 14 · montflow-multi-reviewer/A001-explore-review-pipeline/TASK.md · task.completion-unchecked × 9 · montflow-multi-reviewer/A001-explore-review-pipeline/TASK.md
✓ montflow-opencode-migration (45 warnings)
  ! task.missing-size × 24 · montflow-opencode-migration/A001-explore-pi-extension-surface/TASK.md · task.completion-unchecked × 14 · montflow-opencode-migration/A001-explore-pi-extension-surface/TASK.md · gate.unchecked × 7 · montflow-opencode-migration/C001-adapter-spine-and-loader-proof/GATES.md
✓ montflow-project-structure (43 warnings)
  ! task.missing-size × 20 · montflow-project-structure/A001-explore-structural-core/TASK.md · task.completion-unchecked × 16 · montflow-project-structure/A001-explore-structural-core/TASK.md · gate.unchecked × 7 · montflow-project-structure/C001-create-unified-skill/GATES.md
✓ montflow-spec-standard (11 warnings)
  ! task.missing-size × 5 · montflow-spec-standard/A001-explore-verification-surface/TASK.md · task.completion-unchecked × 4 · montflow-spec-standard/A001-explore-verification-surface/TASK.md · gate.unchecked × 2 · montflow-spec-standard/A003-add-issue-severity-channel/GATES.md
✓ plugin-host-integration (10 warnings)
  ! task.completion-unchecked × 7 · plugin-host-integration/A001-explore-host-integration/TASK.md · gate.unchecked × 3 · plugin-host-integration/C001-fix-plugin-host-loading/GATES.md
✓ spec-optimizations (50 warnings)
  ! task.completion-unchecked × 27 · spec-optimizations/A001-contract/TASK.md · gate.unchecked × 23 · spec-optimizations/A001-contract/GATES.md

8 specs · 0 failed · 0 issues · 227 warnings
$ bun run src/apps/cli/main.ts doctor --check --dir /home/daniel/dev/montflow/spec-optimizations
✓ spec skills and prompts are installed and up to date.
✓ montflow-create-specs: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-create-specs
✓ montflow-find-specs: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-find-specs
✓ spec-create: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-create.json
✓ spec-execute: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-execute.json
✓ spec-sizing: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-sizing.json
EXIT=0
LINES=27
```

### `bun run mf:check:skills` (the skill changed, so its verifier was run too)

```text
$ bun run --cwd packages/skills cli verify --dir $PWD && bun run --cwd packages/skills cli doctor --check --dir $PWD
$ bun run src/apps/cli/main.ts verify --dir /home/daniel/dev/montflow/spec-optimizations
46 skills · 0 issues
$ bun run src/apps/cli/main.ts doctor --check --dir /home/daniel/dev/montflow/spec-optimizations
✓ skills are installed and up to date.
✓ montflow-create-skills: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-create-skills
✓ montflow-modify-skills: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-modify-skills
EXIT=0
```

### Package skill vs workspace mirror

```text
$ diff -r packages/specs/skills/montflow-create-specs .agents/skills/montflow-create-specs
(no output — identical)
```

## Orchestrator gate re-run (2026-10-28, independent of the worker)

Stage 0, all four, exit 0:

```text
$ bun run --cwd packages/specs test
 Test Files  92 passed (92)
      Tests  1227 passed (1227)
Type Errors  no errors
EXIT=0

$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
EXIT=0

$ bun run --cwd packages/specs format:check
$ oxfmt --check .
All matched files use the correct format.
Finished in 398ms on 176 files using 16 threads.
EXIT=0

$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
EXIT=0
```

Stage 1:

```text
$ bun run --cwd packages/specs cli check --dir ../.. --name spec-optimizations
✓ spec-optimizations (50 warnings)
  ! task.completion-unchecked × 27 · spec-optimizations/A001-contract/TASK.md · gate.unchecked × 23 · spec-optimizations/A001-contract/GATES.md

1 spec · 0 failed · 0 issues · 50 warnings
EXIT=0            ← grouped to one line per spec, F001 form intact

$ bun run --cwd packages/specs cli check --dir fixtures --name mock-over-budget
code     review.budget-exceeded
path     mock-over-budget
field    review-series
problem  Review series 'mock-over-budget' holds 4 rounds attributed to phase 'A'; the phase budget is 1.
expected at most 1 round for phase 'A'
actual   4 rounds
1 spec · 1 failed · 1 issue
EXIT=1            ← series, phase, budget, and count all named

$ bun run --cwd packages/specs cli check --dir fixtures --name mock-history
1 spec · 0 failed · 0 issues
EXIT=0            ← a series exactly at budget stays green

$ bun run mf:check:specs | wc -l
27
EXIT=0
```

The `--dir .` line is the cwd artifact recorded in phase E; the repo-root run is
the substantive proof. The real `.agents/@montflow/specs/**` record was not
rewritten: its 50 record warnings render grouped, which is the task's own
requirement 158. All gates pass. F002 completes.
