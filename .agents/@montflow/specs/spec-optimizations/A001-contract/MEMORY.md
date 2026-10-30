# Memory

## Context

A001 lands the sizing contract for `spec-optimizations`: the four sizes, the
review-cycle budget, the layered `sizing.json` schema, coded verification, the
merged resolver, task-size enforcement, structure allowance, the repo-level
store read, and scaffold emission. No CLI output, status/next/sizing verbs
(A002), authoring wiring (A003), or spec-tree backfill (A004) is in scope.

Existing conventions followed: modules under `src/modules/<name>/` with a
`<name>.module.ts`, `index.ts`, optional `CONTEXT.md`, colocated `tests/`
using `@effect/vitest` and namespace imports; `export *` inside a module index
and `export * as X` in `modules/index.ts`; `Issue`/`Result` from `verify`;
`Data.TaggedError` and `Schema` decoding from `effect`.

## Progress

Done. Files added:

- `packages/specs/src/modules/sizing/sizing.module.ts`
- `packages/specs/src/modules/sizing/index.ts`
- `packages/specs/src/modules/sizing/CONTEXT.md`
- `packages/specs/src/modules/sizing/tests/review-cycles.test.ts`
- `packages/specs/src/modules/sizing/tests/verify-config.test.ts`
- `packages/specs/src/modules/sizing/tests/parse-config.test.ts`
- `packages/specs/src/modules/sizing/tests/resolve.test.ts`
- `packages/specs/fixtures/.agents/@montflow/specs/sizing.json` (repo-only)
- `packages/specs/fixtures/.agents/@montflow/specs/mock-ok/sizing.json`
  (spec + phase A)

Files modified (contract, wiring, tests, fixtures):

- `modules/verify/verify.module.ts` — `Issue.code` / `expected` / `actual`,
  `FindingInput` + `finding` factory, `promoteWarnings` preserves new fields.
- `modules/task/task.module.ts` — `Task.size` (optional, `Size`), size in
  `TaskInput`, missing/unknown size rules in `verifyTaskFile`.
- `modules/scaffold/scaffold.module.ts` — `ScaffoldTask.size`,
  `isScaffoldTaskSize`, every rendered `TASK.md` (including the review task)
  emits `size`.
- `apps/cli/cli.apps.module.ts` — `parseScaffoldTask` accepts
  `name[:type[:gates[:size]]]`, defaults `medium`, rejects unknown sizes;
  `--tasks` help text updated.
- `modules/structure/structure.module.ts` — `sizing.json` is the one allowed
  spec-root file; its content is verified and nested under `sizing.json: `.
- `services/spec-store/spec-store.services.module.ts` — `readRootFile(root,
  name)` reads a root config; absent file reads as `undefined`.
- `modules/index.ts` — exports `Sizing`.
- Task/scaffold/structure/verify/store `CONTEXT.md` docs.
- Tests: task helpers now emit `size: medium` by default
  (`withoutSize: true` omits it); size cases added to
  `verify-task-file.test.ts` and `parse-task-file.test.ts`; structure
  allowance cases; scaffold emission; CLI parse/create cases; fixture
  precedence cases; store `readRootFile` case; `list.test.ts` stub updated.
- All fixture `TASK.md` files now carry `size: medium`.
- `fixtures/README.md` documents the two sizing fixtures.

## Findings

- `store.names` already filtered to directories, so `sizing.json` was never a
  candidate spec; the new fixture test pins that behavior for `names` and
  `list`.
- Effect v4 `Schema` gives non-throwing sync decoding through
  `Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Json))`. That is
  what keeps `verifyText` pure without a hand-written `try/catch`; the
  effectful `parse` uses `Schema.decodeUnknownEffect` and preserves the
  original `SchemaError` as `SizingError.cause`.
- The anti-slop lint rules (`--deny-warnings`) reject conditional empty-object
  spreads, `unknown` parameters, runtime `typeof`, and the substring `shape`
  in symbol names. The module therefore decodes JSON to `Schema.Json` at the
  boundary and branches with `Schema.is`; the one remaining `typeof`
  (`Size | TaskSizing` discriminant) carries a justified
  `oxlint-disable-next-line`.
- `phaseReviewBudget` takes `Size | TaskSizing`; a `review` task and a task
  with no declared size contribute nothing. This lets A002 pass real tasks
  (complete tasks may omit `size`) without pre-filtering.
- Unknown phase means a malformed phase-key shape (`phases.a`), or a valid id
  not in `ConfigSource.phases` when the caller supplies the known list. The
  structure verifier deliberately omits that list, so a syntactically valid
  phase with no tasks stays renderable — turning it into a *warning* is A002's
  job (SPEC line 53/62).
- I did not add a repo-wide `.agents/@montflow/specs/sizing.json`; SPEC line 70
  forbids invented model ids outside fixtures.

### Gates (verbatim)

```
$ bun run --cwd packages/specs test
...
 Test Files  64 passed (64)
      Tests  508 passed (508)
Type Errors  no errors
```

```
$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
```
(exit 0, no findings)

```
$ bun run --cwd packages/specs format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 257ms on 134 files using 16 threads.
```

```
$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
```
(exit 0)

```
$ bun run --cwd packages/specs cli check --dir /home/daniel/dev/montflow/spec-optimizations --name spec-optimizations
$ bun run src/apps/cli/main.ts check --dir /home/daniel/dev/montflow/spec-optimizations --name spec-optimizations
1 spec · 0 failed · 0 issues
```

## Open Questions

- None blocking.
- A002 should decide whether a valid-format spec config phase with no tasks is
  rendered as a warning (SPEC line 53) and whether `check` verifies the
  repo-level file through `readRootFile` + `verifyText`/`parse`.
- A002 owns rendering `expected` / `actual` / `code` / cause chains; the `Issue`
  shape now carries them, but `renderCheck` does not print them yet.

## Handoff

- `Sizing.SIZES` / `Size` / `isSize` / `DEFAULT_SIZE` are the only size
  vocabulary; do not restate the four values.
- `Sizing.CODES` is the stable code registry (`sizing.*` for config,
  `task.missing-size` / `task.unknown-size` for tasks).
- `Sizing.verify(source, jsonValue)` → `Result` (all findings);
  `Sizing.verifyText(source, text)` → `Result` (pure, malformed JSON as an
  issue); `Sizing.parse(source, text)` → `Effect<SizingConfig, SizingError>`
  (first failure, preserved cause). `ConfigSource.phases` is optional —
  supply the spec's phase ids to flag valid-format-but-undeclared phases.
- `Sizing.merge(config)` → size → `{ entry, layer }`;
  `Sizing.resolve(config, size)` → `{ size, target, source?, entry? }` with
  `target === 'inherit'` when no layer defines the size.
- `Sizing.phaseReviewBudget` accepts sizes or `{ type, size? }` tasks; a
  `review` task never raises the budget.
- `SpecStore.readRootFile(root, 'sizing.json')` is the repo-level read and
  returns `undefined` for an absent file.
- A003/A004 must not edit this module's contract; A004 backfills sizes on
  other specs' tasks (this spec's tasks already declare sizes).

## Deviations

- The `montflow-typescript-testing` author-separation rule would forbid the
  implementer writing the tests. TASK A001 explicitly requires unit tests for
  this module, and `ask_user` is unavailable to a spec worker, so tests were
  written here. Recorded rather than silently skipped.
- `merge` has no explicit return type because the anti-slop
  `no-known-value-widening` rule rejects the explicit `Merged` annotation on
  that return; the exported `Merged` type still documents the shape.
- No `BOARD.md` broadcast: this phase has no `BOARD.md`, and the worker
  contract for this run limits writes to this `MEMORY.md`.
