# Memory

## Context

A002 surfaces the A001 sizing contract through the commands an agent already
runs. In scope: `status`, `next`, `resolve`, `sizing`, one shared agent-first
diagnostic renderer, repo-level config verification and aggregation in `check`,
phase review budgets in the surfaced output, slash wiring, and CLI tests.
Out of scope: authoring skill/prompts (A003), spec-tree size backfill (A004),
and A001's resolver contract.

Conventions followed: everything lives in the `cli` app (`cli.apps.module.ts`
plus colocated tests), `Effect` v4 `Data.TaggedError` / `Cause` handling,
module namespace imports in tests, token-lean renderers, date-stable output.

The A001 engine was touched in one place only: `SizingError` now carries an
optional `fix` copied from the `Issue` that produced it (and a concrete fix on
the malformed-JSON / schema-decode paths). A002's diagnostics must print a
`fix` for every failure, and the engine's failure type is the only place that
carries the rule's own repair text. No resolver or verifier rule changed.

## Progress

Done.

Files added:

- `packages/specs/src/apps/cli/tests/sizing.test.ts`

Files modified (A002 surface):

- `packages/specs/src/apps/cli/cli.apps.module.ts` — diagnostics, sizing load,
  task targets, report types, renderers, `resolve`/`sizing` commands, slash
  verbs, repo-config check aggregation.
- `packages/specs/src/apps/cli/CONTEXT.md` — new verbs, diagnostic contract,
  slash form.
- `packages/specs/src/apps/cli/tests/helpers.ts` — `stubLayer(specs, rootFiles)`,
  `REPO_SIZING`, `SPEC_SIZING`.
- `packages/specs/src/apps/cli/tests/status.test.ts` — config files, phase
  mapping, budgets, phase/spec/repo/inherit sources, invalid config.
- `packages/specs/src/apps/cli/tests/next.test.ts` — budget header and ready
  task targets, invalid-config omission.
- `packages/specs/src/apps/cli/tests/check.test.ts` — `rootIssues` literals.
- `packages/specs/src/apps/cli/tests/run-slash.test.ts` — `resolve`, `sizing`,
  diagnostics, repo-config check.
- `packages/specs/src/apps/cli/tests/list.test.ts` — `NO_SIZING` literal.
- `packages/specs/src/apps/cli/tests/sizing.test.ts` — compact/detailed sizing,
  budgets, unknown spec/task, invalid config, internal defect, check
  aggregation, unused-phase warning.
- `packages/specs/src/modules/structure/structure.module.ts` + `CONTEXT.md` —
  spec config verified against the spec's real phases; a well-formed phase
  override with no task is now a coded warning.
- `packages/specs/src/modules/sizing/sizing.module.ts` — `SizingError.fix`.
- `packages/specs/src/server.ts` — command description lists `resolve` and
  `sizing` and the task `size` token.
- `packages/specs/fixtures/.agents/@montflow/specs/mock-ok/A001-implement-thing/TASK.md`
  (`tiny`), `.../A002-explore-thing/TASK.md` (`small`),
  `mock-complete/A001-implement-thing/TASK.md` (`small`), and `fixtures/README.md`
  — fixtures now exercise phase, spec, repo, and inherit sources.
- `.agents/@montflow/specs/spec-optimizations/A002-surfacing/MEMORY.md` (this file).

Behaviour landed:

- `status`: `sizing repo <path> · spec <path|none>` (or `sizing none`), one
  `Phase <id> · budget N · sizes <sizes>` header per phase, a
  `sizes <size> <target> · …` mapping line, and
  `<mark> <id> <name> <type> <size> <target> <source>` per task.
- `next`: header gains `· budget N`; each ready line appends size, target, and
  source after the name (existing prefix preserved).
- `resolve`: prints exactly `provider/model#effort` or `inherit`.
- `sizing`: compact `id  size  target  [source]`; `--verbose`/`--human` print
  declared size, target + layer, task/phase budgets, and a
  `size × {repo,spec,phase} × winner` matrix. A missing layer cell reads
  `absent`; a missing size within a present layer reads `-`.
- Diagnostics: one shape (`code`, `path`, `field`, `problem`, `expected`,
  `actual`, `fix`, `cause`, `stack` under `--verbose`, `next`). Exit `1` for
  expected validation failures, `2` for internal defects. `check` renders every
  coded finding as that shape; legacy non-coded findings keep the old terse
  line.
- `check` verifies the repo `sizing.json` once per run (`rootIssues`), adds it
  to counts and exit code, and `checkExitCode` fails on root-config errors.

## Findings

- `Effect.catchAll` does not exist in effect `4.0.0-rc.112`; the load path uses
  `Effect.matchEffect` to turn an (unreachable after verification) `SizingError`
  into an `Issue`. No `Effect.orDie`, so status/next never die on config.
- `Cause.findErrorOption` + `Cause.findDefect` are the v4 API for the
  expected-vs-internal split; `Cause.findDefect` returns a `Result`, aliased as
  `EffectResult` because `Result` is already the verify result type in the CLI.
- `Sizing.verifyText` without a phase list accepts any syntactically valid
  phase. `structure` now declares the spec's real phase ids, maps
  `sizing.unknown-phase` findings whose `actual` matches `PHASE_PATTERN` to
  warnings (coded, `severity: 'warning'`), and keeps malformed phase keys as
  errors. This satisfies SPEC line 53/62 without changing the engine.
- Ordering in `check`: task findings are collected before the spec config block
  now, so a spec's coded issue order is task findings then config findings.
  `renderCheck` prints the repo config block before the spec blocks.
- Changing fixture task sizes is safe: A001's fixture tests assert resolution
  on bare sizes, not task sizes; `fixtures:check` still reports the same
  `4 specs · 2 failed · 11 issues`.
- `--verbose` for `check` still only adds passing specs and the root; the
  "cause chain and layer trace" wording in SPEC line 62 is not implemented as a
  separate trace because `Issue` carries no layer/cause data. See Open
  Questions.

## Open Questions

- SPEC line 62 asks `check --verbose` for a "cause chain and layer trace". The
  current surface prints coded diagnostics only; there is no layer provenance
  on an `Issue`. If the phase review wants that, it needs either a new `Issue`
  field or a `loadSizing` call inside `check` (per spec) to attach layers.
- Slash `resolve`/`sizing` without `--task` fail with a `StoreError` usage
  message (server logs `SpecResolve failed: …`) rather than the diagnostic
  block. The CLI flags make the case unreachable; the slash form treats it as
  usage, not a sizing failure.
- `status`/`next` now exit `1` when a config file is invalid. TASK only requires
  the non-zero exit for `resolve`/`sizing`; this is a deliberate consistency
  choice (recorded here, not hidden).

## Handoff

- `Sizing.MODEL` vocabulary unchanged: `SIZES`, `isSize`, `resolve`, `merge`,
  `targetOf`, `phaseReviewBudget`, `reviewCycles`, `CODES`, `INHERIT`.
  A002 reads them; it does not restate the four sizes.
- `SizingError` now has `fix?: string`; A003/A004 should treat that as additive.
- CLI exports other code may consume: `SizingLoad`, `NO_SIZING`, `loadSizing`,
  `TaskTarget`, `SizingReport`, `sizingOf`, `renderSizing`,
  `renderSizingReport`, `renderSizingMode`, `SizingDiagnostic`,
  `renderDiagnostic`, `renderDiagnostics`, `diagnoseCause`, `SurfaceError`,
  `SURFACE_CODES`, `VALIDATION_EXIT_CODE`, `INTERNAL_EXIT_CODE`,
  `StatusReport.sizing`, `NextReport.sizing`/`budget`, `ReadyTask.sizing`.
- The execute prompt / orchestrator (C-series) can read `next` and pass
  `task.sizing.target` as `model` only when it is not `inherit`.
- A004 must not copy the fixture task sizes into the real spec tree; the
  fixture sizes (`tiny`/`small`) are test evidence only.

## Deviations

- Added `fix` to `SizingError` in A001's module. A002's contract requires every
  diagnostic to print a concrete `fix`, and the engine's failure type is the
  only carrier of that text; no verification or resolution rule changed.
- Wrote new tests for the surfaced commands myself (the `montflow-typescript-
  testing` author-separation rule). `ask_user` is unavailable to a spec worker
  and TASK A002 explicitly requires the tests.
- Set `status`/`next` to exit `1` on invalid config although TASK names the
  non-zero exit only for `resolve`/`sizing`; recorded rather than silently
  skipped.
- No `BOARD.md` broadcast: this phase has no `BOARD.md`, and this run limits
  writes to this `MEMORY.md`.

### Gates (verbatim)

```
$ bun run --cwd packages/specs test
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when it does.


 RUN  v5.0.4 /home/daniel/dev/montflow/spec-optimizations/packages/specs


 Test Files  66 passed (66)
      Tests  564 passed (564)
Type Errors  no errors
```

```
$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
```
(exit 0; only Node's `MODULE_TYPELESS_PACKAGE_JSON` notices for the lint config)

```
$ bun run --cwd packages/specs format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 250ms on 135 files using 16 threads.
```

```
$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
```
(exit 0)

```
$ bun run fixtures:check
...
4 specs · 2 failed · 11 issues
error: script "fixtures:check" exited with code 1
```
(unchanged from A001: `mock-bad` and `mock-stale` still fail as intended)

### CLI evidence (verbatim)

```
$ bun run cli status --name mock-ok --dir fixtures
mock-ok · in-progress · in-place
state pending
author Mock · created 2026-01-01
tasks 3 · 3 pending
verify ✓ verified
sizing repo sizing.json · spec mock-ok/sizing.json

Phase A · budget 2 · sizes tiny,small
  sizes tiny fixture/phase-model#high · small fixture/spec-model · medium inherit · large inherit
  ○ A001  implement-thing          execution  tiny  fixture/phase-model#high  phase
  ○ A002  explore-thing            exploratory  small  fixture/spec-model  spec
  ○ A099  review-phase             review  medium  inherit
exit=0
```

```
$ bun run cli status --name mock-complete --dir fixtures
mock-complete · complete · in-place
state complete
author Mock · created 2026-01-01 · locked A
tasks 2 · 2 complete
verify ✓ verified
sizing repo sizing.json · spec none

Phase A · locked · budget 2 · sizes small
  sizes tiny fixture/repo-model#low · small fixture/repo-model#low · medium inherit · large inherit
  ✓ A001  implement-thing          execution  small  fixture/repo-model#low  repo
  ✓ A099  review-phase             review  medium  inherit
exit=0
```

```
$ bun run cli next --name mock-ok --dir fixtures
state pending · phase A · budget 2
A001  gated  execution  implement-thing  tiny  fixture/phase-model#high  phase
exit=0
```

```
$ bun run cli resolve --name mock-ok --task A001 --dir fixtures
fixture/phase-model#high
exit=0

$ bun run cli resolve --name mock-ok --task A002 --dir fixtures
fixture/spec-model
exit=0

$ bun run cli resolve --name mock-ok --task A099 --dir fixtures
inherit
exit=0
```

```
$ bun run cli sizing --name mock-ok --task A001 --dir fixtures
A001  tiny  fixture/phase-model#high  phase
exit=0

$ bun run cli sizing --name mock-ok --task A001 --human --dir fixtures
A001 · declared tiny · target fixture/phase-model#high · source phase
budget 1 · contributes 1 · phase A budget 2

size    repo                    spec                       phase                     winner
tiny    fixture/repo-model#low  fixture/spec-model#medium  fixture/phase-model#high  phase
small   fixture/repo-model#low  fixture/spec-model         -                         spec
medium  -                       -                          -                         inherit
large   -                       -                          -                         inherit
exit=0
```

```
$ bun run cli sizing --name mock-ok --task Z999 --dir fixtures
code     task.not-found
path     mock-ok/Z999
field    id
problem  Task 'Z999' not found in spec 'mock-ok'.
fix      Pass a task id listed under Phase in `mf-specs status --name mock-ok`.
next     mf-specs status --name mock-ok
exit=1

$ bun run cli resolve --name nope --task A001 --dir fixtures
code     spec.not-found
path     nope
field    name
problem  Spec 'nope' not found.
fix      Pass a spec directory name that exists under the specs root.
next     mf-specs list
exit=1
```

Invalid config, aggregated in one `check` run (`/tmp/opencode/a002-invalid`:
bad repo config, spec config with an unknown key + unused phase B, two tasks
with no size):

```
$ bun run cli check --dir /tmp/opencode/a002-invalid
✗ sizing.json (2)
  code     sizing.missing-model
  path     sizing.json
  field    sizes.tiny.model
  problem  A size entry requires a model.
  expected provider/model
  actual   missing
  fix      Add "model": "provider/model" to sizes.tiny.
  next     mf-specs check
  code     sizing.effort-without-model
  path     sizing.json
  field    sizes.tiny.effort
  problem  An effort without a model is invalid.
  expected a "model" alongside "effort"
  actual   model missing
  fix      Add "model" to sizes.tiny, or remove "effort".
  next     mf-specs check
✗ bad-sizing (3 issues · 1 warning)
  code     task.missing-size
  path     bad-sizing/A002-bad-two/TASK.md
  field    size
  problem  Required frontmatter field is missing; a declared size is required for 'pending' tasks.
  expected tiny, small, medium, large
  actual   missing
  fix      Add `size: medium` to TASK.md frontmatter (tiny, small, medium, large).
  next     mf-specs check --name bad-sizing
  code     task.missing-size
  path     bad-sizing/A001-bad-one/TASK.md
  field    size
  problem  Required frontmatter field is missing; a declared size is required for 'pending' tasks.
  expected tiny, small, medium, large
  actual   missing
  fix      Add `size: medium` to TASK.md frontmatter (tiny, small, medium, large).
  next     mf-specs check --name bad-sizing
  code     sizing.unknown-key
  path     bad-sizing/sizing.json
  field    extra
  problem  Unknown key 'extra'.
  expected sizes or phases
  actual   extra
  fix      Remove 'extra' from bad-sizing/sizing.json.
  next     mf-specs check --name bad-sizing
  code     ! sizing.unknown-phase
  path     bad-sizing/sizing.json
  field    phases.B
  problem  Phase 'B' has no tasks in this spec; the override is unused.
  expected a phase with at least one task
  actual   B
  fix      Remove 'phases.B' from sizing.json, or add a task in phase B.
  next     mf-specs check --name bad-sizing

1 spec · 1 failed · 5 issues · 1 warning
exit=1
```

```
$ bun run cli sizing --name bad-sizing --task A001 --dir /tmp/opencode/a002-invalid
code     sizing.missing-model
path     sizing.json
field    sizes.tiny.model
problem  A size entry requires a model.
expected provider/model
actual   missing
fix      Add "model": "provider/model" to sizes.tiny.
next     mf-specs check --name bad-sizing

code     sizing.effort-without-model
path     sizing.json
field    sizes.tiny.effort
problem  An effort without a model is invalid.
expected a "model" alongside "effort"
actual   model missing
fix      Add "model" to sizes.tiny, or remove "effort".
next     mf-specs check --name bad-sizing

code     sizing.unknown-key
path     bad-sizing/sizing.json
field    extra
problem  Unknown key 'extra'.
expected sizes or phases
actual   extra
fix      Remove 'extra' from bad-sizing/sizing.json.
next     mf-specs check --name bad-sizing
exit=1
```

`status --name bad-sizing --dir /tmp/opencode/a002-invalid` prints the panel,
`verify ✗ 3 issues · 1 warning`, the coded unused-phase warning, `sizing ✗ 3
issues`, and then the same three config diagnostics; exit `1`.

## Follow-up fix

Closed the gap the phase review verified: `check` now renders a sizing finding's
preserved cause and layer provenance under `--verbose`, and the shared `Issue`
carries both.

- `Issue` gained optional `cause` (original failure, kept whole until render
  time) and `layers` (`{ consulted, layer?, phase? }`); `finding`, `issue`,
  `warning`, and `promoteWarnings` preserve them. Existing findings without
  either field render exactly as before.
- `Sizing.verifyText` attaches the Schema decode failure as `cause` on the
  malformed-JSON finding. `Sizing.parse` already preserved the cause on
  `SizingError`; `issueOfSizingError` now copies it onto the `Issue`.
- `check` attaches the layer trace to sizing findings: repo config
  `consulted repo · layer repo`; spec config `consulted repo,spec · layer spec`;
  a nested override `consulted repo,spec,phase · layer phase · phase A`; a
  task-size finding `consulted repo,spec,phase · phase A`.
- `renderCheck` keeps the compact shape byte-for-byte; `--verbose` adds `cause`
  and `layers` rows. Non-sizing findings keep their terse line in both modes.
- `SizingDiagnostic.cause` is now `unknown` and renders as a cause chain
  (`cause <- cause`); `diagnoseCause` behaviour is otherwise unchanged.
- `check --verbose` already existed (it added passing specs and the root); this
  fix extends it rather than adding a new flag. The orchestrator briefing said
  `check` had no `--verbose`; the repo state disagreed.

### Reproduction (before)

```
$ bun run --cwd packages/specs cli check --dir /tmp/opencode/a002-gap
✗ sizing.json (1)
  code     sizing.malformed-json
  path     sizing.json
  field    root
  problem  Config is not valid JSON.
  expected a JSON object with a "sizes" map
  actual   unparseable JSON
  fix      Rewrite sizing.json as valid JSON.
  next     mf-specs check

0 specs · 0 failed · 1 issue
exit=1
```

`/tmp/opencode/a002-gap/.agents/@montflow/specs/sizing.json` holds `{"sizes": {`.

### Reproduction (after)

Compact output is unchanged:

```
$ bun run --cwd packages/specs cli check --dir /tmp/opencode/a002-gap
✗ sizing.json (1)
  code     sizing.malformed-json
  path     sizing.json
  field    root
  problem  Config is not valid JSON.
  expected a JSON object with a "sizes" map
  actual   unparseable JSON
  fix      Rewrite sizing.json as valid JSON.
  next     mf-specs check

0 specs · 0 failed · 1 issue
exit=1
```

`--verbose` adds the cause chain and layer trace:

```
$ bun run --cwd packages/specs cli check --dir /tmp/opencode/a002-gap --verbose
root /tmp/opencode/a002-gap/.agents/@montflow/specs
✗ sizing.json (1)
  code     sizing.malformed-json
  path     sizing.json
  field    root
  problem  Config is not valid JSON.
  expected a JSON object with a "sizes" map
  actual   unparseable JSON
  fix      Rewrite sizing.json as valid JSON.
  cause    Expected a valid JSON string
  layers   consulted repo · layer repo
  next     mf-specs check

0 specs · 0 failed · 1 issue
exit=1
```

The cause is Effect's `SchemaError` message; `Schema.fromJsonString` discards the
underlying `JSON.parse` `SyntaxError`, and SPEC forbids a synchronous
throw-and-catch JSON parse, so the preserved cause is the Schema decode failure.

### Gates (verbatim, final run)

```
$ bun run --cwd packages/specs test
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when it does.

 RUN  v5.0.4 /home/daniel/dev/montflow/spec-optimizations/packages/specs


 Test Files  70 passed (70)
      Tests  658 passed (658)
Type Errors  no errors
---TEST_EXIT=0
```

```
$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
(node:685947) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/spec-optimizations/oxlint.config.ts?cache=1793032491649 is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:685947) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/spec-optimizations/tooling/oxlint/anti-slop/effect/index.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/tooling/oxlint/package.json.
---LINT_EXIT=0
```

```
$ bun run --cwd packages/specs format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 434ms on 142 files using 16 threads.
---FORMAT_EXIT=0
```

```
$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
---TS_EXIT=0
```

```
$ bun run --cwd packages/specs cli check --dir "/home/daniel/dev/montflow/spec-optimizations" --name spec-optimizations
$ bun run src/apps/cli/main.ts check --dir /home/daniel/dev/montflow/spec-optimizations --name spec-optimizations
1 spec · 0 failed · 0 issues
---CLI_EXIT=0
```

### Files touched (follow-up)

- `packages/specs/src/modules/verify/verify.module.ts` (`LayerTrace`; `Issue.cause` / `Issue.layers`)
- `packages/specs/src/modules/sizing/sizing.module.ts` (malformed-JSON cause; cause carried into `SizingError` from an issue)
- `packages/specs/src/modules/structure/structure.module.ts` (phase warning keeps extra fields)
- `packages/specs/src/apps/cli/cli.apps.module.ts` (cause chain, layer trace, verbose-only check detail)
- `packages/specs/src/apps/cli/tests/check.test.ts` (cause, layer, non-sizing tests)
- `packages/specs/src/modules/sizing/tests/verify-config.test.ts` and `packages/specs/src/modules/structure/tests/verify-spec-tree.test.ts` (malformed-JSON cause)
- `packages/specs/README.md`, `packages/specs/src/apps/cli/CONTEXT.md`, `packages/specs/src/modules/verify/CONTEXT.md`
