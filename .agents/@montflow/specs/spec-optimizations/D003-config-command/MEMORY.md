# Memory

## Context

D003 `config-command` wires `spec-sizing` into the same command surfaces as
`author` and `execute`: the `sizing-config` verb, the `spec_sizing` host tool,
and `/specs sizing-config`. The verb renders the wizard for a repo, spec, phase,
or open scope and writes nothing; the tool and slash form dispatch the same
executor. D002 had already extended doctor's owned set to three prompts and
installed `spec-sizing.json`, so this run did not redo that — it verified the
gate and fixed the stale prose.

Worktree `/home/daniel/dev/montflow/spec-optimizations`, branch
`feat/spec-optimizations`. Scope held to D003: command engine, scope derivation,
usage diagnostics, slash form, host tool + registration, command description,
doctor/CLI/prompt CONTEXT + README prose that said two prompts, tests, and this
MEMORY. No `SPEC.md`, task status, lock, other task directory, profile, or skill
edits; no `ask_user`; no git commit.

Conventions followed: one `SurfaceError` diagnostic shape through
`diagnostic`/`diagnoseCause`; `parseMode` reused from C002; the prompt loaded
only through `modules/prompt`; tests use throwaway roots and never write a real
`sizing.json`; pure scope derivation is exported and unit-tested.

## Progress

Done.

Files added:

- `packages/specs/src/apps/cli/tests/sizing-config.test.ts` (20 cases: 8 scope
  derivation, 12 runtime)

Files modified:

- `packages/specs/src/apps/cli/cli.apps.module.ts` — `SIZING_SCOPES`,
  `SizingScope`, `SizingScopeRequest`, `SizingConfigOptions`,
  `SizingScopeResolution`, `resolveSizingScope`, `SIZING_CONFIG_PROMPT`,
  `SizingConfigReport`, `sizingConfig`, `modeRefusalDiagnostic` (shared by
  `execute` and `sizing-config`), `sizingConfigCommand`, slash command list +
  `--scope` parsing + `sizing-config` branch.
- `packages/specs/src/apps/server/spec-tools.apps.module.ts` —
  `SpecSizingInput`, `specSizingTool`, importing `sizingConfig`.
- `packages/specs/src/server.ts` — registers `spec_sizing` after
  `spec_execute`; `COMMAND_DESCRIPTION` carries the verb, scope flags, and the
  open-scope behaviour; entry JSDoc names the third tool.
- `packages/specs/src/apps/cli/tests/run-slash.test.ts` — new
  `Cli.runSlash sizing-config runtime` block (5 cases).
- `packages/specs/src/apps/server/tests/spec-tools.test.ts` — new
  `spec_sizing tool` block (6 cases) and a sizing skill fixture.
- `packages/specs/src/tests/server.test.ts` — four-tool registration and the
  `sizing-config` description assertions.
- `packages/specs/src/apps/cli/tests/doctor.test.ts` — focused
  `spec-sizing.json` missing/stale `--check` case, no-write assertion.
- `packages/specs/src/apps/doctor/CONTEXT.md`,
  `packages/specs/src/modules/prompt/CONTEXT.md`,
  `packages/specs/src/apps/cli/CONTEXT.md`, `packages/specs/README.md` — three
  owned prompts, the new verb/slash/tool, and the no-write contract.
- `.agents/@montflow/specs/spec-optimizations/D003-config-command/MEMORY.md`
  (this file).

Behaviour landed:

- `resolveSizingScope` treats blank `--scope`/`--name`/`--phase` as absent, trims
  identifiers, implies spec from `--name` and phase from `--name --phase`, and
  lets an explicit `--scope` win. It refuses an unknown scope, `--phase` without
  `--name`, `--scope spec|phase` without `--name`, `--scope phase` without
  `--phase`, `--scope repo` with `--name`/`--phase`, and `--scope spec` with
  `--phase`. Every refusal is `cli.invalid-argument` with the offending flag as
  `path`/`field`, the supplied flags as `actual`, a concrete `fix`, and the
  corrected command as `next`.
- `sizingConfig(workspace, options)` parses `--mode` first (guided default,
  rejected values `prompt.mode`), then derives the scope, then loads and renders
  `spec-sizing` through `modules/prompt`. Values are `mode` plus only the fixed
  `scope`/`name`/`phase` and a non-blank `focus`; the loader folds `mode` into
  `unsupervised`. It returns `{ scope, name, phase, prompt }` and never touches
  the store or the filesystem.
- `sizing-config` uses `workspaceDirFlag` (nearest repo root by default), prints
  only the rendered prompt, and provides only `PromptStore.Default`.
- `/specs sizing-config` shares the engine and catches `Cause` through the same
  `slashFailure`/`diagnoseCause` path as `author`/`execute`; `--scope` was added
  to the value-flag set so `--scope=spec` and `--scope spec` both work.
- `spec_sizing` renders through `sizingConfig`, dispatches through the injected
  `PromptExecute.PromptExecutor` (`options.execute`), and fails with
  `failureText(cause, workspace, 'mf-specs sizing-config')` instead of
  dispatching. It never adds a second loader or child-run path.
- Doctor already owns `spec-create`, `spec-execute`, and `spec-sizing`; the
  installer is generic over `SPEC_PROMPT_NAMES`, so `--check` reports
  `spec-sizing` `missing`/`stale` per file and writes nothing. The new doctor
  test pins it.
- AUTHOR/`execute`/`which` behaviour is unchanged: `modeRefusalDiagnostic` emits
  the same rows the previous inline block did.

## Findings

- `effect/cli` rejects a literal empty flag value (`--name ""`) before the
  command body, printing help and exiting `1`. The "empty `--name` is absent"
  rule is therefore enforced in `resolveSizingScope` and reached by the slash
  form (`--name=`); unit tests pin both. See Open Questions.
- `spec-sizing` declares `executing-skills`, `grilling`, and `i-have-adhd` in
  addition to the two doctor-owned spec skills. Every throwaway workspace used
  by a render test installs stubs for those three, exactly like the execute
  tests install the review skills.
- No store is needed to derive a scope: the wizard reads spec state itself, so
  `sizingConfig` requires only `PromptStore`. This keeps the command usable from
  a workspace whose spec tree is incomplete, which is the case the wizard exists
  for.
- `COMMAND_DESCRIPTION` is one long line; the new clause keeps it greppable:
  `sizing-config [--scope repo|spec|phase] [--name <spec>] [--phase <id>]
  [--focus <text>] [--mode guided|autonomous] (no --scope asks which layer;
  --name implies spec and --name --phase implies phase).`
- `mf:check:specs` is literally
  `cli check --dir $PWD && cli doctor --check --dir $PWD`. Bun pins `$PWD` to
  the root package directory even when invoked from elsewhere, so the stale
  probe ran both halves against a throwaway copy (see Evidence); the check half
  passed `1 spec · 0 failed · 0 issues` and the doctor half failed only on
  `spec-sizing`, so the conjunction exits `1`.

## Evidence

### Gates (verbatim, after the final edit)

```
$ bun run --cwd packages/specs test
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.4 /home/daniel/dev/montflow/spec-optimizations/packages/specs


 Test Files  84 passed (84)
      Tests  1007 passed (1007)
Type Errors  no errors
   Start at  17:00:44
   Duration  2.72s (import 80%, tests 14%, transform 5%, typecheck 1%, worker 1%)

EXIT=0
```

```
$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
(node:...) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/spec-optimizations/oxlint.config.ts?cache=... is not specified and it does not parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:...) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/spec-optimizations/tooling/oxlint/anti-slop/effect/index.ts?cache=... is not specified and it does not parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/tooling/oxlint/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
EXIT=0
```

The only lint output beyond the script echo is Node's
`MODULE_TYPELESS_PACKAGE_JSON` notice for root/tooling config; it is not a
finding.

```
$ bun run --cwd packages/specs format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 332ms on 152 files using 16 threads.
EXIT=0
```

```
$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
EXIT=0
```

```
$ bun run mf:check
46 skills · 0 issues
5 prompts · 0 issues · 0 warnings
6 specs · 0 failed · 0 issues · 79 warnings
12 profiles · 0 issues · 0 warnings
8 files · 0 issues
EXIT=0
```

The 79 warnings are the pre-existing `task.missing-size` advisories on historical
completed tasks; every scope reports zero issues. `doctor --check` within the
specs half reported `✓ spec-sizing: up to date → .../.agents/@montflow/prompts/spec-sizing.json`.

### Live scope probes (verbatim excerpts)

```
$ bun run --cwd packages/specs cli sizing-config --dir "$PWD"
Scope is open: no layer is selected. Ask which layer before any write. Nothing may be written until the scope and the proposal are resolved.
Ask the user one question: size the repo-wide config, one spec, or one phase of one spec. Show the existing config you found as the context for the choice. Do not propose sizes yet.
Guided run: wait for the user at each of the three points before moving on; an unanswered proposal is never written.
EXIT=0
```

```
$ bun run --cwd packages/specs cli sizing-config --dir "$PWD" --scope repo
Scope: repo (fixed for this run; do not ask which layer).
The only path this run may write is the one matching that scope:
- `repo` -> `<specs-root>/sizing.json`, by default `.agents/@montflow/specs/sizing.json`, with `sizes` only and never a `phases` key.
```

```
$ bun run --cwd packages/specs cli sizing-config --dir "$PWD" --name spec-optimizations
Scope: spec (fixed for this run; do not ask which layer).
Spec: spec-optimizations. Its config is `spec-optimizations/sizing.json`.
```

```
$ bun run --cwd packages/specs cli sizing-config --dir "$PWD" --name spec-optimizations --phase D
Scope: phase (fixed for this run; do not ask which layer).
Spec: spec-optimizations. Its config is `spec-optimizations/sizing.json`.
Phase: D. The write target is `phases.D.sizes` inside `spec-optimizations/sizing.json`.
```

```
$ bun run --cwd packages/specs cli sizing-config --dir "$PWD" --scope repo --mode autonomous
Autonomous run: decide the scope, the proposal, and any overwrite yourself, record one line per call in the report or the task's `MEMORY.md`, and continue without asking. Ask only for a destructive or irreversible action or a decision you genuinely cannot make from the config and the catalogue.
```

The guided repo render instead carries the `Guided run: wait for the user`
sentence, and §5 carries:

```
Show the exact JSON and the exact path this run will write, then ask the user to confirm or adjust. Write only after that confirmation. Also ask before overwriting a non-empty size entry with a different value; an unchanged entry, an empty entry, and a new file need no extra permission. Never write before the scope and the proposal are resolved.
```

No-write probe: after every scope render above (and the autonomous run),
`find .agents/@montflow/specs -name 'sizing.json' | wc -l` printed `0`. The unit
test `renders for every scope without writing a file` snapshots every file
before/after the four runs and asserts the tree is byte-identical.

### Conflict probes (verbatim)

```
$ bun run --cwd packages/specs cli sizing-config --dir "$PWD" --phase D
code     cli.invalid-argument
path     --phase
field    --phase
problem  --phase requires --name <spec>: 'D' belongs to no spec in this command.
expected --name <spec> alongside --phase
actual   --phase D
fix      Pass --name with the spec holding phase 'D': mf-specs sizing-config --name <spec> --phase D.
next     mf-specs sizing-config --name <spec> --phase D
EXIT=1
```

```
$ bun run --cwd packages/specs cli sizing-config --dir "$PWD" --scope spec
code     cli.invalid-argument
path     --scope
field    --scope
problem  --scope spec requires --name <spec>.
expected --name <spec>
actual   --scope spec
fix      Pass --name with the spec config to size: mf-specs sizing-config --scope spec --name <spec>.
next     mf-specs sizing-config --scope spec --name <spec>
EXIT=1
```

```
$ bun run --cwd packages/specs cli sizing-config --dir "$PWD" --scope phase --name spec-optimizations
code     cli.invalid-argument
path     --scope
field    --scope
problem  --scope phase requires --phase <id>.
expected --phase <id>
actual   --scope phase --name spec-optimizations
fix      Pass the phase to size: mf-specs sizing-config --scope phase --name spec-optimizations --phase <id>.
next     mf-specs sizing-config --scope phase --name spec-optimizations --phase <id>
EXIT=1
```

```
$ bun run --cwd packages/specs cli sizing-config --dir "$PWD" --scope repo --name spec-optimizations
code     cli.invalid-argument
path     --scope
field    --scope
problem  --scope repo sizes the repo config, but --name spec-optimizations was supplied.
expected no --name or --phase with --scope repo
actual   --scope repo --name spec-optimizations
fix      Drop the spec and phase flags to size the repo config: mf-specs sizing-config --scope repo.
next     mf-specs sizing-config --scope repo
EXIT=1
```

```
$ bun run --cwd packages/specs cli sizing-config --dir "$PWD" --scope spec --name spec-optimizations --phase D
code     cli.invalid-argument
path     --scope
field    --scope
problem  --scope spec sizes one spec config, but --phase D was supplied.
expected no --phase with --scope spec
actual   --scope spec --name spec-optimizations --phase D
fix      Drop --phase to size the spec config, or pass --scope phase to size one phase: mf-specs sizing-config --scope spec --name spec-optimizations.
next     mf-specs sizing-config --scope spec --name spec-optimizations
EXIT=1
```

```
$ bun run --cwd packages/specs cli sizing-config --dir "$PWD" --mode nope
code     prompt.mode
path     --mode
field    --mode
problem  Unknown interaction mode 'nope'.
expected one of guided, autonomous
actual   nope
fix      Pass --mode guided or --mode autonomous, or omit --mode for guided.
next     mf-specs sizing-config --mode guided
EXIT=1
```

```
$ bun run --cwd packages/specs cli sizing-config --dir "$PWD" --scope workspace
code     cli.invalid-argument
path     --scope
field    --scope
problem  Unknown sizing scope 'workspace'.
expected one of repo, spec, phase
actual   workspace
fix      Pass --scope repo, --scope spec --name <spec>, --scope phase --name <spec> --phase <id>, or omit --scope for the open scope.
next     mf-specs sizing-config --scope repo
EXIT=1
```

Empty `--name` is refused by `effect/cli` before the body:

```
$ bun run --cwd packages/specs cli sizing-config --dir "$PWD" --scope spec --name ""
DESCRIPTION
  Render the spec-sizing prompt for the repo, one spec, one phase, or the open scope. Writes nothing, dispatches nothing.
...
EXIT=1
```

The engine rule and the slash path are pinned by
`treats a blank --name as absent` (`/specs sizing-config --name=` renders the
open scope; `/specs sizing-config --scope spec --name=` fails
`--scope spec requires --name`) and by `trims identifiers and treats a blank
--name as absent`.

### Doctor gate probes (verbatim)

Missing prompt in a fresh throwaway workspace:

```
$ bun run --cwd packages/specs cli sizing-config --dir /tmp/opencode/d003-gate-XXXX
code     prompt.missing
path     /tmp/opencode/d003-gate-XXXX/.agents/@montflow/prompts/spec-sizing.json
field    prompt
problem  Prompt 'spec-sizing' is not installed.
expected a current 'spec-sizing.json' at '/tmp/opencode/d003-gate-XXXX/.agents/@montflow/prompts/spec-sizing.json'
actual   not installed at '/tmp/opencode/d003-gate-XXXX/.agents/@montflow/prompts/spec-sizing.json'
fix      Run mf-specs doctor to install or refresh the shipped skills and prompts.
next     mf-specs sizing-config
EXIT=1
```

Stale prompt after `doctor` installed it and the file was rewritten:

```
$ bun run --cwd packages/specs cli sizing-config --dir /tmp/opencode/d003-gate-XXXX --scope repo
code     prompt.stale
path     /tmp/opencode/d003-gate-XXXX/.agents/@montflow/prompts/spec-sizing.json
field    prompt
problem  Prompt 'spec-sizing' is not current: 'spec-sizing.json' differs from the package.
expected a current 'spec-sizing.json' at '/tmp/opencode/d003-gate-XXXX/.agents/@montflow/prompts/spec-sizing.json'
actual   'spec-sizing.json' differs from the package
fix      Run mf-specs doctor to install or refresh the shipped skills and prompts.
next     mf-specs sizing-config
EXIT=1
```

`doctor --check` on a workspace with no payloads reported `spec-sizing`
missing, exited `1`, and wrote nothing:

```
$ bun run --cwd packages/specs cli doctor --check --dir /tmp/opencode/d003-check-XXXX
✗ spec skills and prompts are not current.
✗ spec-sizing: not installed at '/tmp/opencode/d003-check-XXXX/.agents/@montflow/prompts/spec-sizing.json' → /tmp/opencode/d003-check-XXXX/.agents/@montflow/prompts/spec-sizing.json (from /home/daniel/dev/montflow/spec-optimizations/packages/specs/prompts/spec-sizing.json)
DOCTOR_EXIT=1
```

`--check` added no file: the 33 files listed under `.agents` were the copied
fixture spec only.

### `mf:check:specs` stale probe (verbatim)

The script body is `check --dir $PWD && doctor --check --dir $PWD`. Both halves
ran against `/tmp/opencode/d003-check-ok-XXXX`, a copied `mock-ok` spec with a
doctor-installed payload whose `spec-sizing.json` was appended to:

```
$ bun run src/apps/cli/main.ts check --dir "/tmp/opencode/d003-check-ok-wIdd7E"
1 spec · 0 failed · 0 issues
$ bun run src/apps/cli/main.ts doctor --check --dir "/tmp/opencode/d003-check-ok-wIdd7E"
✗ spec skills and prompts are not current.
✓ montflow-create-specs: up to date → /tmp/opencode/d003-check-ok-wIdd7E/.agents/skills/montflow-create-specs
✓ montflow-find-specs: up to date → /tmp/opencode/d003-check-ok-wIdd7E/.agents/skills/montflow-find-specs
✓ spec-create: up to date → /tmp/opencode/d003-check-ok-wIdd7E/.agents/@montflow/prompts/spec-create.json
✓ spec-execute: up to date → /tmp/opencode/d003-check-ok-wIdd7E/.agents/@montflow/prompts/spec-execute.json
✗ spec-sizing: 'spec-sizing.json' differs from the package → /tmp/opencode/d003-check-ok-wIdd7E/.agents/@montflow/prompts/spec-sizing.json (from /home/daniel/dev/montflow/spec-optimizations/packages/specs/prompts/spec-sizing.json)
Run: mf-specs doctor
EXIT=1
UNCHANGED=yes
```

`UNCHANGED=yes` is the sha256 of `spec-sizing.json` before and after the doctor
half: `--check` diagnosed the drift without repairing it.

### Slash and tool parity

- `Cli.runSlash sizing-config runtime > dispatches the same rendered prompt as
  the shared engine` asserts `slash.output === sizingConfig(...).prompt.text` for
  `--name ok --mode autonomous`.
- `spec_sizing tool > renders the same prompt text as the binary engine` asserts
  the executor's `text` equals `sizingConfig(...).prompt.text` for phase scope.
- `specs server command > registers the spec_author, spec_execute, spec_sizing,
  and spec_models tools` pins the registration order and the description.

### Test inventory

`packages/specs/src/apps/cli/tests/sizing-config.test.ts` (20):

1. leaves the scope open with no flags or only blank values
2. implies spec from `--name` and phase from `--name` plus `--phase`
3. accepts every fixed scope, with `--scope` winning over the flags
4. trims identifiers and treats a blank `--name` as absent
5. refuses `--phase` without `--name` and names the corrected command
6. refuses `--scope spec` or `phase` without `--name`
7. refuses `--scope phase` without `--phase`
8. refuses a `--scope` that contradicts `--name` or `--phase`
9. refuses an unknown scope with the accepted values
10. renders the open scope and its declared skills
11. renders the repo scope and names the repo file only
12. renders the spec scope named by `--name`
13. renders the phase scope with its nested write target
14. defaults to guided and renders the autonomous branch only for autonomous
15. carries an optional focus verbatim
16. rejects an unknown mode before the prompt gate
17. refuses a conflict before the prompt gate and names the fix
18. refuses a missing `spec-sizing` prompt with code, path, and fix
19. refuses a stale `spec-sizing` prompt with code, path, and fix
20. renders for every scope without writing a file

Plus `run-slash.test.ts` (5 sizing-config cases), `spec-tools.test.ts` (6
`spec_sizing` cases), `server.test.ts` (registration/description), and
`doctor.test.ts` (missing/stale `spec-sizing` `--check`, no write).

## Open Questions

1. **Empty `--name` at the process boundary.** `effect/cli` treats `--name ""`
   as a missing flag value and prints help with exit `1`, so the CLI never
   reaches `resolveSizingScope` for that exact input. The rule is implemented
   and tested at the engine boundary and through the slash form (`--name=`).
   If a usage diagnostic is wanted for the literal CLI form too, the flag needs
   a custom parser that accepts an empty string; that is a framework change, not
   a `sizing-config` change. Left as-is; no flow can size the wrong layer.
2. **No spec/phase existence check.** `sizing-config --name nope` renders the
   spec-scoped prompt; the wizard's step 1/2 then reports the unknown spec via
   `mf-specs status`. TASK does not ask the command to validate the tree, and
   validating would force a store dependency the wizard does not need. D004/review
   can decide whether the command should fail early instead.
3. **Who documents the wizard.** README now names the verb, the three prompts,
   and the no-write/open-scope contract, but the full wizard narrative
   (checkpoints, catalogue-driven generation, effort-from-variants, inherit,
   merge, proof loop) remains D004's job per TASK.
4. **`COMMAND_DESCRIPTION` length.** The line is long by design; a reviewer may
   prefer splitting it, but the current convention is one greppable string.

## Handoff

- **D004**: the command surface is complete and documented at the verb level.
  It still owns the wizard narrative in README, the authoring skill's sizing
  section, and the `spec-sizing-orchestrator` handoff sentence from the creation
  and execution profiles.
- **Reviewers**: judge (a) every conflict names both the problem and the
  corrected command, (b) a blank name is absent rather than an empty identifier,
  (c) `--scope` wins and no input can silently size another layer, (d) the
  command renders and writes nothing (the only write is the agent's post-
  confirmation write), (e) the slash form and `spec_sizing` call the same
  `sizingConfig` engine and executor, (f) the doctor gate fails with
  `prompt.missing`/`prompt.stale`, path, and fix before rendering, and (g)
  author/execute/which and doctor behaviour are unchanged.
- **Next task needs**: nothing beyond its own scope. `SIZING_SCOPES`,
  `SizingScope`, and `resolveSizingScope` are exported if a later surface needs
  the same derivation; do not copy the rule.

## Deviations

- **Doctor ownership was already landed in D002.** This run verified the third
  prompt end to end and added a focused `spec-sizing` missing/stale test instead
  of redoing `SPEC_PROMPT_NAMES`, the embedded payload, or the workspace sync.
- **Docs scope.** TASK names doctor docs, `apps/cli/CONTEXT.md`, and the README
  section listing shipped prompts; this run also updated
  `modules/prompt/CONTEXT.md` because it still said `PROMPT_NAMES` was two.
  The broader README/skill/profile pass stays with D004.
- **`format:fix` was run package-wide** after `format:check` named five edited
  files; the check re-run is clean.
- **`mf:check:specs` stale proof uses a copied workspace.** Bun pins `$PWD` to
  the root package directory, so the script cannot be pointed at a temp root;
  both commands the script runs were executed against the copy instead, with the
  check half passing and the doctor half failing only on `spec-sizing`.
- **No `BOARD.md` broadcast**: this phase has no `BOARD.md`, and this run may
  write only its own `MEMORY.md`.
- **No git commit**, per the worker contract.
