# Memory

## Context

- Spec: `spec-optimizations`, task F003 `surface-nits`, size `small`, phase F.
- Scope: four small surface inconsistencies (SPEC requirement 180, with 166 for
  the sizing line). Work confined to `packages/specs`.
- Inherited state, untouched: phase E's `GUARD_RERUN` table, the single
  `modules/diagnostic` renderer with `verbose` gating `cause`/`layers`/`stack`,
  and `check --strict` staying gate-only.
- Repo working tree already carried uncommitted phase-E changes before this task
  started; the diff shown by `git diff --stat` is therefore wider than this task.

## Progress

- done — (1) `sizing --human` budget line relabelled to
  `size budget N · contributes N · phase <id> · phase budget M`; review tasks
  show `contributes 0`; compact line unchanged.
- done — (2) `Catalogue.filterProvider` drops the default unless it names a
  model that survives the filter, so `models --json --provider <id>` emits
  `"default": null` instead of a label outside the document; the filtered
  document still decodes as `--catalog` input.
- done — (3) `which` prefix matching now requires the shorter name to end at a
  `-` boundary (`isPrefixPair`); exact matches still win, `feat/s` no longer
  matches `spec-optimizations`, `feat/spec` still does.
- done — (4) slash parser validates flags per command from one
  `SLASH_COMMAND_FLAGS` table (plus `--dir`/`--verbose` common row); unknown and
  misplaced flags are `cli.invalid-argument` with the corrected command, before
  any store, prompt, or git read.
- done — regression tests for all four surfaces; docs updated (README,
  `apps/cli/CONTEXT.md`, `modules/catalogue/CONTEXT.md`,
  `modules/which/CONTEXT.md`).
- done — every `GATES.md` command run; evidence below.

## Findings

- Sizing label: `renderSizingReport` printed `budget 1 · contributes 1 · phase A
  budget 2`, so the task's own size budget read as an unlabelled "budget" and a
  review task's own 3 looked like a contribution. The phase id is kept and the
  phase number is now labelled too: `size budget 1 · contributes 1 · phase A ·
  phase budget 2`. `contribution()` was already correct (review → 0); only the
  label was wrong.
- Filtered JSON: `filterProvider` preserved `catalogue.default` unconditionally,
  so `models --json --provider alpha` emitted `"default":
  "fixture/default-model"` beside a model list that did not contain it. Fix is
  upstream of rendering, in the pure catalogue module, so the slash form and
  `spec_models` `list` inherit it. The document stays round-trippable because
  `default: null` is valid `--catalog` input.
- `which`: `isPrefixPair` was `name.startsWith(feature) || feature.startsWith(name)`,
  so the one-letter feature `s` matched every spec starting with `s`. A `-`
  boundary rule fixes both directions at once; no minimum-length constant is
  needed and exact matches still short-circuit first. The miss's `expected` row
  now states the boundary rule.
- Slash flags: the parser tracked only the flags it read, so `--scope` on
  `/specs execute`, `--json` on `/specs check`, and `--task` on `/specs status`
  parsed and vanished. The parser now records every `--token` with its value,
  and one per-command table decides. A misplaced flag suggests the command that
  owns it, carrying the supplied flags that command also reads
  (`/specs execute --scope repo` → `/specs sizing-config --scope repo`);
  `resolve`/`sizing` suggestions add a `--name <spec>` placeholder because
  neither runs without one (`/specs status --task A001` → `/specs resolve
  --name <spec> --task A001`). An unknown flag is refused with the command's own
  flag row. Validation runs before the first store/prompt/git read, so the
  refusal is identical on a machine with no specs root.
- Verified refusals through the real slash engine (ad-hoc script, since deleted):
  `/specs execute --scope repo`, `/specs check --json`, `/specs status --task
  A001`, `/specs check --bogus --name spec-optimizations` all render the full
  eight-row block:

```
code     cli.invalid-argument
path     execute
field    --scope
problem  Flag --scope is not implemented by /specs execute.
expected --dir, --verbose, --name, --phase, --focus, --mode on /specs execute
actual   --scope repo
fix      Run /specs sizing-config --scope repo instead, or drop --scope to keep /specs execute: /specs execute.
next     /specs sizing-config --scope repo
ok=false
---
code     cli.invalid-argument
path     check
field    --json
problem  Flag --json is not implemented by /specs check.
expected --dir, --verbose, --name, --strict on /specs check
actual   --json
fix      Run /specs models --json instead, or drop --json to keep /specs check: /specs check.
next     /specs models --json
ok=false
---
code     cli.invalid-argument
path     status
field    --task
problem  Flag --task is not implemented by /specs status.
expected --dir, --verbose, --name on /specs status
actual   --task A001
fix      Run /specs resolve --name <spec> --task A001 instead (or /specs sizing), or drop --task to keep /specs status: /specs status.
next     /specs resolve --name <spec> --task A001
ok=false
---
code     cli.invalid-argument
path     check
field    --bogus
problem  Flag --bogus is not a flag any /specs command implements.
expected --dir, --verbose, --name, --strict on /specs check
actual   --bogus
fix      Drop --bogus: /specs check implements --dir, --verbose, --name, --strict.
next     /specs check --name spec-optimizations
ok=false
```

## Gate evidence

### Stage 0: Verification

`bun run --cwd packages/specs test`

```
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.4 /home/daniel/dev/montflow/spec-optimizations/packages/specs


 Test Files  92 passed (92)
      Tests  1195 passed (1195)
Type Errors  no errors
   Start at  19:26:09
   Duration  2.84s (import 80%, tests 15%, transform 4%, typecheck 1%, worker 1%)
```

`bun run --cwd packages/specs lint:check`

```
$ oxlint --deny-warnings .
```
(exit 0; Node prints its usual `MODULE_TYPELESS_PACKAGE_JSON` warnings for
`oxlint.config.ts` and the local `anti-slop` tooling, which are not lint
findings.)

`bun run --cwd packages/specs format:check`

```
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 365ms on 159 files using 16 threads.
```

`bun run --cwd packages/specs ts:check`

```
$ tsc --noEmit
```

### Stage 1: Behaviour

`bun run --cwd packages/specs cli sizing --dir . --name spec-optimizations --task D099 --human`

```
$ bun run src/apps/cli/main.ts sizing --dir . --name spec-optimizations --task "D099" --human
code     store.error
path     spec-optimizations
field    root
problem  Specs directory not found: .agents/@montflow/specs
fix      Pass --dir <repo root> (the directory holding .agents/@montflow/specs) and re-run the command.
next     mf-specs check --name spec-optimizations
error: script "cli" exited with code 1
```

Same line with the repo root (the workspace the store lives in):

`bun run --cwd packages/specs cli sizing --dir ../.. --name spec-optimizations --task D099 --human`

```
$ bun run src/apps/cli/main.ts sizing --dir ../.. --name spec-optimizations --task "D099" --human
D099 · declared small · target inherit
size budget 2 · contributes 0 · phase D · phase budget 3

size    repo    spec    phase   winner
tiny    absent  absent  absent  inherit
small   absent  absent  absent  inherit
medium  absent  absent  absent  inherit
large   absent  absent  absent  inherit
```

The gate's three substrings (`size budget`, `contributes 0`, `phase budget`) are
all present in the repo-root run. The `--dir .` run under
`bun run --cwd packages/specs` points the store at
`packages/specs/.agents/@montflow/specs`, which does not exist, so it can only
report `store.error`; that is a path artifact of the `--cwd`, not a behaviour
failure. A non-review task in the same store, for contrast:

`bun run --cwd packages/specs cli sizing --dir ../.. --name spec-optimizations --task F003 --human`

```
F003 · declared small · target inherit
size budget 2 · contributes 2 · phase F · phase budget 3

size    repo    spec    phase   winner
tiny    absent  absent  absent  inherit
small   absent  absent  absent  inherit
medium  absent  absent  absent  inherit
large   absent  absent  absent  inherit
```

Compact line unchanged:

`bun run --cwd packages/specs cli sizing --dir ../.. --name spec-optimizations --task F003`

```
F003  small  inherit
```

`bun run --cwd packages/specs cli models --json --provider alpha --catalog fixtures/catalog.json`

```
$ bun run src/apps/cli/main.ts models --json --provider alpha --catalog fixtures/catalog.json
{
  "default": null,
  "models": [
    {
      "providerID": "alpha",
      "modelID": "a-model",
      "variants": null
    }
  ]
}
```

Same line with the repo root (`--dir ../..`, store resolved from the workspace):

`bun run --cwd packages/specs cli models --dir ../.. --json --provider alpha --catalog fixtures/catalog.json`

```
$ bun run src/apps/cli/main.ts models --dir ../.. --json --provider alpha --catalog fixtures/catalog.json
{
  "default": null,
  "models": [
    {
      "providerID": "alpha",
      "modelID": "a-model",
      "variants": null
    }
  ]
}
```

Round-trip proof (filtered document fed back as `--catalog`):

```
$ bun run src/apps/cli/main.ts models --json --provider alpha --catalog fixtures/catalog.json
$ bun run src/apps/cli/main.ts models --json --catalog /tmp/opencode/alpha-catalog.json
{
  "default": null,
  "models": [
    {
      "providerID": "alpha",
      "modelID": "a-model",
      "variants": null
    }
  ]
}
```

`bun run --cwd packages/specs cli which --dir . --branch feat/s`

```
$ bun run src/apps/cli/main.ts which --dir . --branch feat/s
code     store.error
path     .
field    root
problem  Specs directory not found: .agents/@montflow/specs
fix      Pass --dir <repo root> (the directory holding .agents/@montflow/specs) and re-run the command.
next     mf-specs which
error: script "cli" exited with code 1
```

Same line with the repo root:

`bun run --cwd packages/specs cli which --dir ../.. --branch feat/s`

```
$ bun run src/apps/cli/main.ts which --dir ../.. --branch feat/s
code     SPEC_NO_MATCH
path     ../../.agents/@montflow/specs
field    branch
problem  No spec matches feature 's' from branch 'feat/s'.
expected exactly one spec name equal to the feature, or a prefix of it ending at a "-"
actual   feat/s · candidates installation-guide, montflow-ci-verification, montflow-multi-reviewer, montflow-opencode-migration, montflow-project-structure, montflow-spec-standard, plugin-host-integration, spec-optimizations
fix      Pass --name installation-guide or --name montflow-ci-verification or --name montflow-multi-reviewer or --name montflow-opencode-migration or --name montflow-project-structure or --name montflow-spec-standard or --name plugin-host-integration or --name spec-optimizations.
next     ask the user
error: script "cli" exited with code 1
```

`feat/s` now fails instead of matching `spec-optimizations`; the boundary cases
still resolve:

```
$ bun run src/apps/cli/main.ts which --dir ../.. --branch feat/spec
spec-optimizations
$ bun run src/apps/cli/main.ts which --dir ../.. --branch feat/spec-optimizations
spec-optimizations
```

## Open Questions

- Should the F003 gate's `--dir .` lines be reworded to `--dir ../..`? Under
  `bun run --cwd packages/specs` the store is two levels up, so the literal lines
  can only fail with `store.error`. Recorded both runs above; the wording is the
  orchestrator's call.
- Should `/specs check` also accept `--concurrency`, which the binary has but the
  slash form never documented? It is now refused as unknown rather than silently
  ignored. Left out of the table on purpose: adding it is a feature, not this
  nit.

## Handoff

- Next task (F099 review) should judge: the exact budget line wording
  (`size budget N · contributes N · phase <id> · phase budget M`), whether the
  `which` boundary rule is the intended reading of requirement 131 ("unique
  prefix match"), and whether the slash `SLASH_COMMAND_FLAGS` table is the right
  home for the per-command contract as `apps/cli` splits (G004).
- Reusable table: `SLASH_COMMAND_FLAGS` in
  `packages/specs/src/apps/cli/cli.apps.module.ts` is the one place a new slash
  flag must be declared; the parser, the refusal, and the docs all read it.
- Regression tests live in `src/apps/cli/tests/{sizing,models,which,run-slash}.test.ts`,
  `src/modules/catalogue/tests/catalogue.test.ts`, and
  `src/modules/which/tests/resolve.test.ts`.

## Deviations

- Did not broadcast to `BOARD.md` or `MAILBOX.md`: the task instruction says this
  worker writes only its own `MEMORY.md` and touches no records, which overrides
  the profile's broadcast step.
- `format:fix` was run once to repair a formatting nit in
  `src/apps/cli/CONTEXT.md`; it touched no other file (the preceding
  `format:check` named only that file).
- Files touched: `src/apps/cli/cli.apps.module.ts`,
  `src/modules/catalogue/catalogue.module.ts`,
  `src/modules/which/which.module.ts`,
  `src/apps/cli/tests/sizing.test.ts`, `src/apps/cli/tests/models.test.ts`,
  `src/apps/cli/tests/run-slash.test.ts`, `src/apps/cli/tests/which.test.ts`,
  `src/modules/catalogue/tests/catalogue.test.ts`,
  `src/modules/which/tests/resolve.test.ts`, `README.md`,
  `src/apps/cli/CONTEXT.md`, `src/modules/catalogue/CONTEXT.md`,
  `src/modules/which/CONTEXT.md`, and this `MEMORY.md`.

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
$ bun run --cwd packages/specs cli sizing --dir ../.. --name spec-optimizations --task D099 --human
D099 · declared small · target inherit
size budget 2 · contributes 0 · phase D · phase budget 3

size    repo    spec    phase   winner
tiny    absent  absent  absent  inherit
   (review task: contributes 0; `size budget` and `phase budget` both named)

$ bun run --cwd packages/specs cli sizing --dir ../.. --name spec-optimizations --task F003
F003  small  inherit
   (compact line unchanged — no budget)

$ bun run --cwd packages/specs cli models --json --provider alpha --catalog fixtures/catalog.json
{
  "default": null,
  "models": [ { "providerID": "alpha", "modelID": "a-model", "variants": null } ]

$ bun run --cwd packages/specs cli which --dir ../.. --branch feat/s
code     SPEC_NO_MATCH
expected exactly one spec name equal to the feature, or a prefix of it ending at a "-"
actual   feat/s · candidates installation-guide, montflow-ci-verification, …
EXIT=1

$ bun run --cwd packages/specs cli which --dir ../.. --branch feat/spec
spec-optimizations
EXIT=0
```

`--dir .` on the first Stage 1 line is the cwd artifact recorded in phase E; the
repo-root run above is the substantive proof. All gates pass. F003 completes.
