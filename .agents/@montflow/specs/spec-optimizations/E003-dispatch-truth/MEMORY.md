# Memory

## Context

Task E003 (`dispatch-truth`) closes two truthfulness gaps found by the phase E
audit, for spec `spec-optimizations`:

- `mf-specs next --name mock-bad` exited `0` while `check` reported 10 issues,
  because `next`'s exit rule counted only config and task-size errors.
- `mf-specs models --verify --provider alpha` printed the bare success line
  `✓ no model or effort findings` after checking zero entries.

`depends-on: E001`; E001's `guardSpecName` / `guardPhase` and E002's
`prompt.skill-advisory` path are present in the working tree and untouched here.
Work is confined to `packages/specs`.

## Progress

- Reproduced both gaps against the fixtures before editing:
  `next --name mock-bad` printed `state blocked · phase A · budget 3` /
  `ready none` and exited `0`; `models --verify --provider alpha` printed only
  `✓ no model or effort findings`.
- Dispatch truth (`packages/specs/src/apps/cli/cli.apps.module.ts`):
  `dispatchErrors` now returns every error `verifySpecTree` reports, not only
  config and task-size errors. A spec-config finding is reported once: the tree
  verifier re-reads `<spec>/sizing.json`, so those repeats are dropped and the
  `loadSizing` copy (which carries the spec-qualified path) is kept.
  `dispatchExitCode` therefore returns `1` for any error `check` reports, and
  `status` / `next` share one rule and one blocker renderer.
- `statusCommand` now sets `process.exitCode` from `dispatchExitCode` alone
  (its old `!verify.valid` check was a second, partial copy of the same rule).
  `nextCommand` likewise sets the shared exit code.
- `/specs status` and `/specs next` both report `ok` from
  `dispatchExitCode(...) === 0`. Dropped `/specs next`'s extra
  `state !== 'inconsistent'` clause, which could disagree with the binary.
- `execute` was already refusing on every `verify` error before rendering the
  prompt; no change needed, and its coverage still passes.
- `models --verify` counts (`cli.apps.module.ts`, `spec-tools.apps.module.ts`):
  config entries are tagged with their layer (`repo` or `spec`, with phase
  overrides belonging to the spec layer). `verifyModels` returns
  `counts: { checked, skipped, layers, provider }` and always renders one count
  line:
  `<n> entries checked · <m> skipped · repo <c> checked, <s> skipped · [spec …] · provider <filter|all>`.
  `checked + skipped` equals every entry the loaded configs define. A pass with
  `checked === 0` prints no success line at all; a pass with entries prints the
  existing `✓ no model or effort findings` line and then the counts.
- `spec_models` `verify` returns `report.output` unchanged, so the tool's reply
  carries the same counts as the binary; its description now says so.
- `packages/specs/src/apps/cli/CONTEXT.md` dispatch-gating paragraph updated to
  describe the widened rule.
- Tests added/updated:
  - `src/apps/cli/tests/fixtures.test.ts` — `next` on `mock-bad` exits `1`,
    still renders the ready set (`ready none`), and lists a non-config tree
    blocker; `status` and `next` return the same exit code and finding set;
    `next` on `mock-ok` exits `0` with its ready task and no blockers.
  - `src/apps/cli/tests/models.test.ts` — zero-config run is `0 entries checked`
    with no success line; repo-only counts `2/0`; named-spec counts `5/0`
    split `repo 2` / `spec 3`; zero-entry provider filter is `0 entries checked`
    with skipped entries and the provider named; no-name and named zero-entry
    cases both suppress `✓`.
  - `src/apps/cli/tests/run-slash.test.ts` — `/specs next` ok `true` on a valid
    spec and ok `false`, matching `/specs status`, on a broken tree.
  - `src/apps/server/tests/spec-tools.test.ts` — `spec_models verify` reply
    contains the same counts as the binary.

## Findings

- `next` and `status` already loaded the same `Result`; only their exit rule and
  blocker set were narrower than `check`. Widening `dispatchErrors` to every
  error is the smallest change that makes all three agree.
- Duplicate-suppression detail: the tree verifier nests the spec config's
  findings under `sizing.json: …`, while `loadSizing` reports
  `<spec>/sizing.json: …`. Keeping the tree copy would have double-printed
  config errors in `status`/`next`. `repeatedConfigFinding` drops the tree copy
  for `sizing.*` codes whose field starts `sizing.json: ` only.
- "Skipped" is defined as *entries excluded by the provider filter*, so
  `checked + skipped` is the full configured entry count. This is the only
  reading that makes a zero-entry filtered run state its zero while keeping the
  count auditable (`models --verify --provider alpha` on fixtures reports
  `0 entries checked · 2 skipped · repo 0 checked, 2 skipped · provider alpha`).
  The alternative reading (unknown variants skip the effort check) was rejected
  because it is not a provider-filter split and cannot produce
  `0 entries checked`.
- Blocker rows for legacy tree findings render with `code unspecified` and no
  `expected`/`actual`/`fix`, because those findings have no stable code yet.
  That is the pre-existing `diagnosticOfIssue` shape, not a new regression;
  giving structure findings codes is F002/G003 work.
- Blocker order can differ between two runs because `SpecStore.snapshot`'s file
  order is directory-read order. The blocker *set* and exit code are identical;
  the fixtures test compares the set, not the order. No sorting was added to
  keep the diff inside E003.
- `execute` already refused on any `report.verify` error, so it needed no
  change; the requirement "keeps refusing before dispatch" is preserved and
  covered by the existing author-execute suite.
- `models --verify` still exits `0` on warnings, as SPEC requires; counts do not
  change the exit contract.

## Open Questions

- `packages/specs/README.md` still says `next` "Exits non-zero when the phase
  carries the same config or task-size errors as `check`", and its `models`
  bullet does not mention checked/skipped counts. Both sentences are now stale.
  E004 (`docs-truth`, `depends-on: E001, E003`) owns the README sweep but its
  TASK lists only the sizing transcript and budget sentence, so its owner must
  decide whether to extend the sweep to these two lines. Left unedited here to
  avoid duplicating E004.

## Handoff

- E004: extend the README sweep to the `next` exit sentence and the `models`
  bullet; the binary now prints the count line described above.
- E099 review: attack (a) a spec whose only error is a non-sizing tree finding
  — `next`/`status` must both exit `1` and print it once; (b) a spec with an
  invalid spec `sizing.json` — blockers must not duplicate the config finding;
  (c) `models --verify` with no config and with a provider filter that matches
  nothing — no `✓` may appear, counts must sum; (d) `/specs next` and
  `/specs status` ok flags against the binary exit codes.
- No spec state, locks, ledgers, or other task directories were touched.

## Deviations

- Updated `packages/specs/src/apps/cli/CONTEXT.md` dispatch-gating paragraph,
  which is not named in `GATES.md`, because it documents the exact function
  whose contract changed; keeping it stale would have been a docs-truth
  regression. No behaviour, prompt, or spec-file change.
- Updated the `spec_models` tool description sentence to mention the counts the
  tool now returns. Description-only; no wiring change.
- Ran every Stage 1 command against both roots as directed: `--dir .` resolves
  to `packages/specs` (no specs store), so the substantive valid-tree assertion
  was also proven with `--dir ../..` and with `--dir fixtures --name mock-ok`.

## Gate Evidence

### `bun run --cwd packages/specs test`

```text
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.4 /home/daniel/dev/montflow/spec-optimizations/packages/specs


 Test Files  90 passed (90)
      Tests  1106 passed (1106)
Type Errors  no errors
   Start at  16:52:33
   Duration  2.98s (import 77%, tests 14%, transform 7%, typecheck 1%, worker 1%)

```

### `bun run --cwd packages/specs lint:check`

```text
$ oxlint --deny-warnings .
(node:1050626) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/spec-optimizations/oxlint.config.ts?cache=1793220759809 is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:1050626) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/spec-optimizations/tooling/oxlint/anti-slop/effect/index.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/tooling/oxlint/package.json.
```

### `bun run --cwd packages/specs format:check`

```text
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 499ms on 155 files using 16 threads.
```

### `bun run --cwd packages/specs ts:check`

```text
$ tsc --noEmit
```

### `bun run --cwd packages/specs cli next --dir fixtures --name mock-bad`

```text
$ bun run src/apps/cli/main.ts next --dir fixtures --name mock-bad
state blocked · phase A · budget 3
ready none

code     unspecified
path     mock-bad/SPEC.md
field    tasks
problem  Task 'A003' has unknown type 'chore'.
next     mf-specs check --name mock-bad

code     unspecified
path     mock-bad/A003-bad-kind/TASK.md
field    type
problem  Must be one of: exploratory, execution, planning, interruptor, defect, review.
next     mf-specs check --name mock-bad

code     unspecified
path     mock-bad/B001-late-thing/MEMORY.md
field    body
problem  Missing `## Deviations` section.
next     mf-specs check --name mock-bad

code     unspecified
path     mock-bad/B002-gated-thing/GATES.md
field    Stage 0: Core Validation
problem  Checklist item is still a placeholder: '<custom validation>'.
next     mf-specs check --name mock-bad

code     unspecified
path     mock-bad
field    A002-explore-thing/MEMORY.md
problem  Required file is missing.
next     mf-specs check --name mock-bad

code     unspecified
path     mock-bad
field    SPEC.md
problem  Task 'A001' Gates column is 'Yes' but GATES.md is missing.
next     mf-specs check --name mock-bad

code     unspecified
path     mock-bad
field    SPEC.md
problem  Task 'A002' status is 'pending' in the table but 'blocked' in TASK.md.
next     mf-specs check --name mock-bad

code     unspecified
path     mock-bad
field    SPEC.md
problem  Task table row 'A003' has no task directory.
next     mf-specs check --name mock-bad

code     unspecified
path     mock-bad
field    task A001
problem  depends-on 'B001' points to a later phase.
next     mf-specs check --name mock-bad

code     unspecified
path     mock-bad
field    phase A
problem  Phase has no `review` task.
next     mf-specs check --name mock-bad
error: script "cli" exited with code 1
EXIT=1
```

### `bun run --cwd packages/specs cli next --dir . --name spec-optimizations`

```text
$ bun run src/apps/cli/main.ts next --dir . --name spec-optimizations
code     store.error
path     spec-optimizations
field    root
problem  Specs directory not found: .agents/@montflow/specs
fix      Pass --dir <repo root> (the directory holding .agents/@montflow/specs) and re-run the command.
next     mf-specs check --name spec-optimizations
error: script "cli" exited with code 1
EXIT=1
```

### `bun run --cwd packages/specs cli next --dir ../.. --name spec-optimizations`

```text
$ bun run src/apps/cli/main.ts next --dir ../.. --name spec-optimizations
state pending · phase E · budget 3
E003  gated  execution  dispatch-truth  small  inherit
EXIT=0
```

### `bun run --cwd packages/specs cli next --dir fixtures --name mock-ok`

```text
$ bun run src/apps/cli/main.ts next --dir fixtures --name mock-ok
state pending · phase A · budget 2
A001  gated  execution  implement-thing  tiny  fixture/phase-model#high  phase
EXIT=0
```

### `bun run --cwd packages/specs cli models --verify --provider alpha --catalog fixtures/catalog.json --dir fixtures`

```text
$ bun run src/apps/cli/main.ts models --verify --provider alpha --catalog fixtures/catalog.json --dir fixtures
0 entries checked · 2 skipped · repo 0 checked, 2 skipped · provider alpha
EXIT=0
```

### `bun run --cwd packages/specs cli models --verify --provider alpha --catalog fixtures/catalog.json --dir ../..`

```text
$ bun run src/apps/cli/main.ts models --verify --provider alpha --catalog fixtures/catalog.json --dir ../..
0 entries checked · 0 skipped · repo 0 checked, 0 skipped · provider alpha
EXIT=0
```

## Orchestrator gate re-run (2026-10-28, independent of the worker)

Stage 0, all four, exit 0 against the post-E003 tree:

```text
$ bun run --cwd packages/specs test
 Test Files  90 passed (90)
      Tests  1106 passed (1106)
Type Errors  no errors
EXIT=0

$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
EXIT=0

$ bun run --cwd packages/specs format:check
$ oxfmt --check .
All matched files use the correct format.
Finished in 361ms on 155 files using 16 threads.
EXIT=0

$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
EXIT=0
```

Stage 1, verbatim:

```text
$ bun run --cwd packages/specs cli next --dir fixtures --name mock-bad
state blocked · phase A · budget 3
ready none

code     unspecified
path     mock-bad/SPEC.md
field    tasks
problem  Task 'A003' has unknown type 'chore'.
EXIT=1

$ bun run --cwd packages/specs cli next --dir . --name spec-optimizations
code     store.error
path     spec-optimizations
field    root
problem  Specs directory not found: .agents/@montflow/specs
EXIT=1

$ bun run --cwd packages/specs cli next --dir ../.. --name spec-optimizations
state pending · phase E · budget 3
E003  gated  execution  dispatch-truth  small  inherit
EXIT=0

$ bun run --cwd packages/specs cli models --verify --provider alpha --catalog fixtures/catalog.json --dir fixtures
0 entries checked · 2 skipped · repo 0 checked, 2 skipped · provider alpha
EXIT=0
```

Line 2's `--dir .` is the same cwd artifact recorded in E001 (`.` is
`packages/specs` under `bun run --cwd`); the substantive assertion — a valid
tree exits 0 from `next` — is proven at the repo root and at
`--dir fixtures --name mock-ok`. GATES.md was not edited. E003 completes.
