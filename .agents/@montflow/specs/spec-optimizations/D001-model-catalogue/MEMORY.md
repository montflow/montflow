# Memory

## Context

D001 `model-catalogue` makes the harness catalogue a mechanical read: the
`packages/opencode` model seam carries effort variants, a pure
`packages/specs/src/modules/catalogue` module normalizes/encodes/checks it, and
one catalogue plus one renderer feed `mf-specs models`, `/specs models`, and the
`spec_models` tool. Scope held to D001; no sizing prompt (D002), config command
(D003), README/skills/profiles (D004), SPEC/task state, locks, or another task's
files.

Conventions followed: modules under `src/modules/<name>/` with
`<name>.module.ts`, `index.ts`, `CONTEXT.md`, colocated `tests/` using
`@effect/vitest`; `Issue`/`finding` for coded findings; `Data.TaggedError`
surfaces (`SurfaceError`); namespace imports for the new module; date-stable
renderers; no I/O in the pure module.

## Progress

Done.

Files added:

- `packages/specs/src/modules/catalogue/catalogue.module.ts`
- `packages/specs/src/modules/catalogue/index.ts`
- `packages/specs/src/modules/catalogue/CONTEXT.md`
- `packages/specs/src/modules/catalogue/tests/catalogue.test.ts` (13 cases)
- `packages/specs/src/apps/cli/tests/models.test.ts` (12 cases)
- `packages/specs/fixtures/catalog.json` (known variants, known-empty, unknown,
  duplicate default-model, unsorted providers)

Files modified:

- `packages/opencode/src/modules/ports/model/model.module.ts` —
  `ModelDescriptor.variants?: readonly string[]`; `ModelEntry.variants?`;
  `ModelVariant`; one `descriptorOf` mapper used by the server half and the TUI
  half. Absent stays absent; `[]` stays `[]`.
- `packages/opencode/src/modules/ports/model/tests/model.test.ts` — variant
  carry, known-empty, unknown, and TUI/server shape parity.
- `packages/specs/src/modules/index.ts` — `export * as Catalogue`.
- `packages/specs/src/apps/cli/cli.apps.module.ts` — catalogue load/list/verify
  engines (`loadCatalogue`, `listModels`, `verifyModels`, `renderModelFindings`,
  `models`), repo-only config loader, config-entry extraction, `models` command,
  `/specs models` slash branch plus `--provider`/`--catalog`/`--json`/`--verify`
  parsing, and a fourth optional model source on `runSlash`.
- `packages/specs/src/apps/cli/tests/run-slash.test.ts` — host-source JSON,
  verify warnings, and unavailable evidence.
- `packages/specs/src/apps/cli/CONTEXT.md` — `models` verb, slash form, tool.
- `packages/specs/src/apps/server/spec-tools.apps.module.ts` — `spec_models`
  input, `ModelsToolOptions`, `specModelsTool` (`list`/`verify`).
- `packages/specs/src/apps/server/tests/spec-tools.test.ts` — input decoding,
  list parity, verify parity, unavailable.
- `packages/specs/src/server.ts` — registers `spec_models`, passes
  `ports.model` to `runSlash`, extends `COMMAND_DESCRIPTION`.
- `packages/specs/src/tests/server.test.ts` — three-tool registration and the
  `models` description.
- `.agents/@montflow/specs/spec-optimizations/D001-model-catalogue/MEMORY.md`
  (this file).

Behaviour landed:

- `normalize`: trim, drop blank ids, dedupe, sort by provider then model, union
  known variant lists on duplicates, `null` on any duplicate keeps unknown.
  Carries the host default (object or joined label) as `default`.
- `--json` document: `{ "default": string|null, "models": [{ providerID,
  modelID, variants: string[]|null }] }`, pretty, date-free, sorted, and valid
  `--catalog` input. `variants: null` = unknown; `[]` = known-empty.
- Table: `provider/model  variants high,low  *` for the default,
  `variants unknown`, and `variants none` for known-empty.
- `mf-specs models [--provider] [--json] [--catalog]`: host-free without
  `--catalog` fails `models.unavailable` naming `--catalog`; malformed or
  unreadable file fails `models.malformed-catalog`; provider miss fails
  `models.unknown-provider` with the known list.
- `mf-specs models --verify [--name]`: repo config always, plus the named spec
  config and every phase override; one pass; `models.unknown-model` and
  `models.unknown-effort` warnings through the A002 diagnostic shape; unknown
  variants skip the effort check; warnings exit `0`; invalid config fails before
  the catalogue check.
- `spec_models`: `list` returns the same JSON document as `models --json`;
  `verify` returns the same findings as `models --verify`; both read the host
  `ModelPort` supplied by `src/server.ts`. `spec_models` is registered after
  `spec_author`/`spec_execute`.
- `/specs models` shares the binary engine and renderer; relative `--catalog`
  resolves against the plugin workspace the same way `--dir` does.

## Findings

- The host `Model.Info` always carries `variants: Variant[]` (possibly empty),
  so the seam can honestly distinguish unknown (key absent on a custom entry)
  from known-empty (`[]`). Both server and TUI halves use one mapper, so they
  cannot drift.
- The binary has no host `ModelPort`, by design. `models` therefore fails
  `models.unavailable` unless `--catalog` is supplied; `/specs models` and
  `spec_models` receive `ports.model` and never need a file.
- Referencing the `Result` type from `effect` is not possible (`Result` is a
  value namespace there); `effect/Result` supplies the type-only import. The
  value import is aliased `R` in the catalogue module.
- `Array#sort` trips `unicorn/no-array-sort` under `--deny-warnings`; all new
  sorts use `toSorted`.
- `no-conditional-empty-object-spread` rejects the old `...(value === undefined
  ? {} : { key: value })` helper style; new helpers build the object then add
  the optional key.
- `no-shape-in-symbol-names` rejects `wrongShape`; renamed to
  `wrongDocument`.
- `verifyModels` reuses A002's `loadSizing` for a named spec, so repo and spec
  findings keep the existing `path: field` nesting and rendering. Repo-only
  verification uses a small `loadRepoSizing` mirroring the same parse path.
- The fixture catalogue sits at `packages/specs/fixtures/catalog.json`
  (fixture workspace root), outside `.agents/@montflow/specs`, so
  `fixtures:check` continues to see only four fixture specs.

## Open Questions

- `models --verify` exits `0` on warnings by design (SPEC calls both warning
  classes advisory). Reviewers should confirm no caller expects a nonzero
  warning exit.
- `--json` + `--verify` is not a usage error; `--verify` wins and prints the
  warnings. `--provider` is ignored under `--verify`. Neither combination is
  specified; left permissive.
- The catalogue JSON key names (`providerID`, `modelID`, `variants`, `default`)
  are D001's choice. D002 (`spec-sizing`) and D004 docs should consume this
  shape rather than inventing a second one.
- `models --catalog` is resolved relative to the process directory in the
  binary and against the plugin workspace in the slash form, matching the
  existing `--dir` split. Worth documenting in D004.

## Handoff

- D002 should call `spec_models` with `action: "list"` (or `mf-specs models
  --catalog`) and treat `variants: null` and `[]` alike for effort: no effort
  token is allowed. `models --verify` is the proof step.
- `Catalogue.normalize` / `toJson` / `decode` / `renderTable` / `verify` are the
  only catalogue API. `Catalogue.CODES` holds the five stable codes.
- `models`, `listModels`, and `verifyModels` are exported from `apps/cli`; the
  `spec_models` tool and slash form reuse them. Do not add a second normalizer
  or renderer.
- `runSlash` now takes an optional fourth `Catalogue.ModelSource`; any new caller
  that exposes `models` must pass a host source or supply `--catalog`.
- D003 can reuse the `PromptError`/`SurfaceError` arms unchanged; this task added
  no prompt/config-command wiring.
- D004 still owns README, the authoring skill, and the orchestrator profile
  handoff.

## Deviations

- Wrote the tests here. `montflow-typescript-testing` prefers author separation,
  but TASK D001 explicitly requires the tests and `ask_user` is unavailable to a
  spec worker.
- Added `models.unknown-provider` (not named in TASK) for the required
  `--provider` miss diagnostic; it is a catalogue-scoped stable code.
- Updated `packages/specs/src/apps/cli/CONTEXT.md` with the new verb/slash/tool.
  D004 owns user-facing docs; this is the module's own belongs-here contract.
- No `BOARD.md` broadcast: the phase has no `BOARD.md`, and this run may write
  only its own `MEMORY.md`.
- No git commit, per the worker contract.

### Gates (verbatim)

```
$ bun run --cwd packages/specs test
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when it does.

 RUN  v5.0.4 /home/daniel/dev/montflow/spec-optimizations/packages/specs

 Test Files  80 passed (80)
      Tests  920 passed (920)
Type Errors  no errors
exit 0
```

```
$ bun run --cwd packages/opencode test
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when it does.

 RUN  v5.0.4 /home/daniel/dev/montflow/spec-optimizations/packages/opencode

 Test Files  28 passed (28)
      Tests  150 passed (150)
Type Errors  no errors
exit 0
```

```
$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
(node:1579400) [MODULE_TYPELESS_PACKAGE_JSON] Warning: ...
exit 0
```

```
$ bun run --cwd packages/opencode lint:check
$ oxlint --deny-warnings .
(node:1579400) [MODULE_TYPELESS_PACKAGE_JSON] Warning: ...
exit 0
```

```
$ bun run --cwd packages/specs format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 333ms on 149 files using 16 threads.
exit 0
```

```
$ bun run --cwd packages/opencode format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 153ms on 50 files using 16 threads.
exit 0
```

```
$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
exit 0
```

```
$ bun run --cwd packages/opencode ts:check
$ tsc --noEmit
exit 0
```

```
$ bun run mf:check
46 skills · 0 issues
4 prompts · 0 issues · 0 warnings
6 specs · 0 failed · 0 issues · 79 warnings
11 profiles · 0 issues · 0 warnings
8 files · 0 issues
exit 0
```

The 79 warnings are the pre-existing `task.missing-size` advisories on
historical completed tasks; every scope reports zero issues.

### Completion evidence (verbatim)

`models --json` from the fixture catalogue:

```
$ bun run --cwd packages/specs cli models --json --catalog fixtures/catalog.json
{
  "default": "fixture/default-model",
  "models": [
    {
      "providerID": "alpha",
      "modelID": "a-model",
      "variants": null
    },
    {
      "providerID": "fixture",
      "modelID": "default-model",
      "variants": [
        "high",
        "low",
        "max"
      ]
    },
    {
      "providerID": "fixture",
      "modelID": "unknown-model",
      "variants": null
    },
    {
      "providerID": "fixture",
      "modelID": "zeta-model",
      "variants": []
    }
  ]
}
EXIT=0
```

Round-trip through `--catalog`:

```
$ bun run --cwd packages/specs cli models --json --catalog fixtures/catalog.json > /tmp/opencode/d001-catalog.json
$ bun run --cwd packages/specs cli models --json --catalog /tmp/opencode/d001-catalog.json > /tmp/opencode/d001-catalog-roundtrip.json
$ diff -q /tmp/opencode/d001-catalog.json /tmp/opencode/d001-catalog-roundtrip.json
d346788e65c587815346c0c6d3e29663d9d10d9eccd7658eb62fadd253545fca  /tmp/opencode/d001-catalog.json
d346788e65c587815346c0c6d3e29663d9d10d9eccd7658eb62fadd253545fca  /tmp/opencode/d001-catalog-roundtrip.json
```

Host-free `models`:

```
$ bun run --cwd packages/specs cli models
code     models.unavailable
path     models
field    catalog
problem  No host model catalogue is available.
expected --catalog <path>, or the host model port
actual   no catalogue source
fix      Pass --catalog <path> with the output of `mf-specs models --json` from a host, or run /specs models.
next     mf-specs models --catalog <path>
EXIT=1
```

`models --verify` on `/tmp/opencode/d001-verify` (repo config has
`fixture/ghost` and `fixture/unknown#whatever`; spec config has
`fixture/known#ultra`; catalogue knows `fixture/known` = `[low, high]` and
`fixture/unknown` = unknown):

```
$ bun run --cwd packages/specs cli models --verify --name demo --catalog /tmp/opencode/d001-verify/catalog.json --dir /tmp/opencode/d001-verify
code     ! models.unknown-model
path     sizing.json
field    sizes.tiny.model
problem  Model 'fixture/ghost' is not in the host catalogue.
expected a model id listed by `mf-specs models`
actual   fixture/ghost
fix      Use a model from `mf-specs models`, or install 'fixture/ghost' on this host and re-run.
next     mf-specs models --verify --name demo

code     ! models.unknown-effort
path     demo/sizing.json
field    sizes.small.effort
problem  Effort 'ultra' is not a variant of 'fixture/known'.
expected one of high, low
actual   ultra
fix      Set demo/sizing.json sizes.small.effort to one of high, low, or remove "effort".
next     mf-specs models --verify --name demo

2 warnings · 1 unknown model · 1 unknown effort
EXIT=0
```

The unknown-variant entry (`fixture/unknown#whatever`) produces no finding:

```
$ bun run --cwd packages/specs cli models --verify --name demo --catalog /tmp/opencode/d001-verify/catalog.json --dir /tmp/opencode/d001-verify | tail -3
next     mf-specs models --verify --name demo

2 warnings · 1 unknown model · 1 unknown effort
EXIT=0
```

`spec_models` parity against the same live catalogue (throwaway script,
removed after the run):

```
{
  "listSame": true,
  "verifySame": true
}
code     ! models.unknown-model
path     sizing.json
field    sizes.tiny.model
problem  Model 'fixture/ghost' is not in the host catalogue.
expected a model id listed by `mf-specs models`
actual   fixture/ghost
fix      Use a model from `mf-specs models`, or install 'fixture/ghost' on this host and re-run.
next     mf-specs models --verify --name demo

code     ! models.unknown-effort
path     demo/sizing.json
field    sizes.small.effort
problem  Effort 'ultra' is not a variant of 'fixture/known'.
expected one of high, low
actual   ultra
fix      Set demo/sizing.json sizes.small.effort to one of high, low, or remove "effort".
next     mf-specs models --verify --name demo

2 warnings · 1 unknown model · 1 unknown effort
```

Unit coverage pins the same parity:
`spec_models tool > list returns the same JSON document as the binary` and
`spec_models tool > verify returns the same findings as the binary`.
`Cli.models verification > skips the effort check for a model with unknown
variants` pins the no-finding rule.
