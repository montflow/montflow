# Memory

## Context

C003 `author-execute-commands`: expose the shipped prompts as commands. The
binary loads and renders a prompt and prints it (model-free); the host tools
`spec_author` / `spec_execute` and the `/specs author|execute` slash forms
dispatch the rendered text through `@montflow/prompts`' shared executor. C001
gave the loader, C002 the mode mapping, C004 the branch resolver; this task
consumes all three without re-implementing any of them.

Worktree `/home/daniel/dev/montflow/spec-optimizations`, branch
`feat/spec-optimizations`. Scope held to: `apps/cli` (engines, commands, slash,
diagnostics), a new `apps/server` tool module, `src/server.ts` wiring,
`packages/prompts`' executor export, tests, and `apps/cli/CONTEXT.md`.

Out of scope and untouched: README/profile/skill docs (C005), `SPEC.md`, task
statuses, locks, other task directories, prompt text. No git commit, no
`ask_user`.

## Progress

Done.

Files added:

- `packages/specs/src/apps/server/spec-tools.apps.module.ts` — `spec_author`
  and `spec_execute` descriptors, their input schemas, and the optional
  host-default model fallback. Both provide the stores locally and reuse the
  injected `PromptExecutor`.
- `packages/specs/src/apps/server/index.ts` — export barrel.
- `packages/specs/src/apps/server/tests/spec-tools.test.ts` — 9 cases.
- `packages/specs/src/apps/cli/tests/author-execute.test.ts` — 16 cases.

Files modified:

- `packages/specs/src/apps/cli/cli.apps.module.ts`
  - `author(workspace, { request, notes })` → `Prompt.load(workspace,
    'spec-create', …)`.
  - `execute(root, { name?, phase?, focus?, mode?, branch?, workspace? })` →
    explicit name wins, else `which`; `status` + `stateOf` + `next`; refuses
    verifier errors, unknown phases, and a spec with no active phase; renders
    `spec-execute` with `state`, `next`, `reviewBudget`, `phase`, `focus`, and
    raw `mode`.
  - `stateOf(report)` extracted so `state` and `execute` share one reduction.
  - `diagnoseCause` gained the `PromptError` arm (`diagnosticOfPromptError`,
    exit `1`).
  - `authorCommand` / `executeCommand`; `rootCommand` help and subcommand list.
  - Slash form: `author` / `execute` commands, `request`/`notes`/`phase`/
    `focus`/`mode` flags, prose joining for `request`/`notes`/`focus`.
  - `SURFACE_CODES` gained `spec.phase-not-found` and `spec.no-active-phase`.
  - `runSlash` now requires `PromptStore.PromptStore`.
  - `workspaceRoot(dir)` — author/execute default to the nearest repository
    root when `--dir` is omitted (see Deviations).
- `packages/specs/src/apps/cli/CONTEXT.md` — both verbs, the slash forms, the
  workspace-root default, the no-dispatch boundary, and the belongs-here list.
- `packages/specs/src/apps/cli/tests/helpers.ts` — `stubLayer` now also
  provides `NodePath` and the real `PromptStore`, and declares both in its
  layer type.
- `packages/specs/src/apps/cli/tests/run-slash.test.ts` — 5 slash cases.
- `packages/specs/src/apps/index.ts` — `export * as Server`.
- `packages/specs/src/server.ts` — `PromptLive`, tool registration through
  `defineTool`, `makePromptExecutor` from `@montflow/prompts`, host default
  model fallback, and the extended `COMMAND_DESCRIPTION`.
- `packages/specs/src/tests/server.test.ts` — fake `tool` port, a tool
  registration assertion, and the extended description assertion.
- `packages/prompts/src/apps/index.ts` — `export * as Server`, so
  `makePromptExecutor` is reachable from `@montflow/prompts`.
- `.agents/@montflow/specs/spec-optimizations/C003-author-execute-commands/MEMORY.md`
  (this file).

## Findings

### Command behaviour

- `author` prints only the rendered `spec-create` text and exits `0`.
- `execute` resolves the spec before any render: `--name` wins;
  otherwise `which(root, { branch, workspace })` reads the branch. A miss is
  the C004 `SurfaceError` unchanged, so the diagnostic keeps
  `next ask the user` and the exact `--name` candidates.
- State and ready set are derived per call (`status` → `stateOf` /
  `renderState`, `next` → `renderNext`); no caller-supplied state exists in
  either the CLI or the tool input.
- `reviewBudget` is `next.budget` (computed by `phaseReviewBudget` in
  `modules/sizing`) or, when `--phase` names a phase, that phase's
  `phaseReviewBudget`. A phase id with no task is `spec.phase-not-found`; a
  spec with no active phase is `spec.no-active-phase`.
- `--phase` is a session limit: it is validated against the spec's task phases
  and passed to the template; the ready set stays the active phase's, which
  the prompt treats as truth.
- `--mode` is passed raw to the loader; `guided` is the loader default,
  `autonomous` maps to `unsupervised`, and anything else is `prompt.mode`.
  The `--mode` help string comes from `Prompt.MODE_HINT`.
- A tree the verifier rejects fails before rendering, using the same
  `Issue` codes and `diagnosticOfIssue` rendering `check` uses. `check`'s
  uncoded issues keep code `unspecified`, as they do in `check`.

### Rendering is model-free; dispatch is only in the host

`author`/`execute` requirements are exactly `SpecStore | FileSystem |
PromptStore`. `spec_author`/`spec_execute` are `ToolDefinition`s whose
`execute` receives the rendered text and calls one injected
`PromptExecute.PromptExecutor`; `server.ts` supplies
`PromptServer.makePromptExecutor(ports)`. No child-run copy exists in
`packages/specs`.

### Live probe — author (TASK Completion 1)

```
$ bun run --cwd packages/specs cli author --request "Ship login"
You are the spec author. Follow the `montflow-create-specs` skill and this pipeline.

Create exactly ONE new spec under `.agents/@montflow/specs/<kebab-name>/`, then stop. Do not execute its tasks. Touch nothing outside `.agents/@montflow/specs/`.

Spec request:
Ship login
…
```
exit `0`, 48 lines, sha256 `2d533f69b7360fd458ab0305455f58a172e6d9577d89a5d44f99c63a7371926a`.
The prompt carries `montflow-create-specs`, not inline skill text.

### Live probe — execute resolves from the branch (TASK Completion 2)

```
$ bun run --cwd packages/specs cli execute
…
Drive exactly this spec toward completion, one phase at a time:
spec-optimizations
…
Derived state:
spec-optimizations · in-progress · state pending · phase C · locked A,B

Ready set:
state pending · phase C · budget 3
C003  gated  execution  author-execute-commands  medium  inherit
C005  gated  execution  docs-and-profiles  small  inherit
…
This phase's review-cycle budget is 3. …
```
exit `0`, 72 lines.

### Live probe — explicit `--name` skips detection (TASK Completion 3)

```
$ bun run --cwd packages/specs cli execute --name spec-optimizations
```
exit `0`; byte-identical to the branch-resolved render:

```
$ diff -q /tmp/opencode/c003-execute.txt /tmp/opencode/c003-execute-name.txt
IDENTICAL to branch-resolved output
$ sha256sum /tmp/opencode/c003-execute.txt /tmp/opencode/c003-execute-name.txt
55382c53d12eb7373c8f476aa2105b4c2a88a82d9fc3d4d5293f51d2f740d3e1  /tmp/opencode/c003-execute.txt
55382c53d12eb7373c8f476aa2105b4c2a88a82d9fc3d4d5293f51d2f740d3e1  /tmp/opencode/c003-execute-name.txt
```

### Live probe — ambiguous branch (TASK Completion 4)

Workspace `/tmp/opencode/c003-ambiguous`, specs `spec-one`/`spec-two`, HEAD
`ref: refs/heads/feat/spec`:

```
$ bun run --cwd packages/specs cli execute --dir /tmp/opencode/c003-ambiguous
code     SPEC_AMBIGUOUS
path     /tmp/opencode/c003-ambiguous/.agents/@montflow/specs
field    branch
problem  Feature 'spec' from branch 'feat/spec' matches 2 specs.
expected exactly one spec name equal to the feature or a prefix of it
actual   feat/spec · candidates spec-one, spec-two
fix      Pass --name spec-one or --name spec-two.
next     ask the user
```
exit `1`. The host tool returns the same block as its failure (tested).

### Live probe — modes (TASK Completion 5)

`--mode autonomous` keeps every shared rule and swaps only the interaction
branch:

```
…## 8. Interaction mode
Autonomous run: do not ask for ordinary decisions. Ask only for:
…
```
exit `0`. `--mode autopilot`:

```
code     prompt.mode
path     /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-execute.json
field    mode
problem  Unknown interaction mode 'autopilot'.
expected one of guided, autonomous
actual   autopilot
fix      Pass --mode guided or --mode autonomous, or omit --mode for guided.
next     mf-specs execute
```
exit `1`.

### Live probe — tiny-only phase budget (TASK Completion 6)

Temp workspace `/tmp/opencode/c003-tiny` (doctor installed, spec `tiny-spec`
with one `tiny` task + its review task):

```
$ bun run --cwd packages/specs cli execute --name tiny-spec --dir /tmp/opencode/c003-tiny
…
state pending · phase A · budget 1
A001  execution  do-it  tiny  inherit
…
This phase's review-cycle budget is 1. …
```
exit `0`.

### Live probe — phase/focus and unknown phase

```
$ bun run --cwd packages/specs cli execute --name spec-optimizations --phase C --focus "Keep diffs minimal"
…
Work only phase `C` this session. Do not start another phase; stop and report when that phase is done.
Steer every worker this session with this focus: Keep diffs minimal
```
(exit `0`; budget remains `3`.)

```
$ bun run --cwd packages/specs cli execute --name spec-optimizations --phase Z
code     spec.phase-not-found
path     spec-optimizations
field    phase
problem  Phase 'Z' not found in spec 'spec-optimizations'.
expected one of A, B, C, D
actual   Z
fix      Pass --phase A or --phase B or --phase C or --phase D.
next     mf-specs check --name spec-optimizations
```
exit `1`.

### Live probe — missing prompt (doctor gate)

```
$ bun run --cwd packages/specs cli author --request "Ship login" --dir /tmp/opencode/c003-noprompt
code     prompt.missing
path     /tmp/opencode/c003-noprompt/.agents/@montflow/prompts/spec-create.json
field    prompt
problem  Prompt 'spec-create' is not installed.
expected a current 'spec-create.json' at '/tmp/opencode/c003-noprompt/.agents/@montflow/prompts/spec-create.json'
actual   not installed at '/tmp/opencode/c003-noprompt/.agents/@montflow/prompts/spec-create.json'
fix      Run mf-specs doctor to install or refresh the shipped prompts.
next     mf-specs author
```
exit `1`.

An invalid tree (missing `MEMORY.md`, required TASK.md sections) also exits
`1` through the same diagnostic shape, e.g.:

```
code     unspecified
path     tiny-spec/A001-do-it/TASK.md
field    body
problem  Missing `## Description` section.
next     mf-specs check --name tiny-spec
```

### Gates (verbatim, run after the last edit)

```
$ bun run --cwd packages/specs test
 Test Files  76 passed (76)
      Tests  824 passed (824)
Type Errors  no errors
exit=0
```

```
$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
exit=0
```

```
$ bun run --cwd packages/specs format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 421ms on 143 files using 16 threads.
exit=0
```

```
$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
exit=0
```

```
$ bun run mf:check
46 skills · 0 issues
4 prompts · 0 issues · 0 warnings
6 specs · 0 failed · 0 issues · 79 warnings
11 profiles · 0 issues · 0 warnings
6 files · 0 issues
exit=0
```

```
$ bun run mf:gate:fast
…
6 specs · 0 failed · 0 issues · 79 warnings
✓ spec skills and prompts are installed and up to date.
exit=0
```

The 79 warnings are the pre-existing `size: Completed task declares no size`
advisories on historical specs; no error and no failed spec. `doctor --check`
inside the run reports both spec prompts up to date.

`packages/prompts` also passes after the new export: 565 tests, `ts:check`,
`lint:check`, `format:check`.

### Test inventory

`apps/cli/tests/author-execute.test.ts` (16):

- author renders the request and the declared skill
- optional notes appear only when supplied
- stale prompt fails `prompt.stale` with the doctor fix
- missing prompt fails `prompt.missing` with the doctor fix
- execute renders state, ready set, budget `1`, guided branch, and the
  re-derive-at-start rule
- resume derives the remaining ready task and budget `2`
- explicit phase becomes the session limit; budget from that phase
- unknown phase fails `spec.phase-not-found` with the known list
- guided default vs autonomous branch; shared rules survive both
- `autopilot` fails `prompt.mode`
- omitted name resolves from the checked-out branch
- ambiguous branch lists both candidates and `next ask the user`
- unknown spec fails `spec.not-found`
- invalid tree is refused before rendering
- renders with no model/session port (binary never dispatches)
- missing prompt after spec resolution

`apps/server/tests/spec-tools.test.ts` (9):

- `spec_author` input schema accepts the documented fields and rejects a
  missing `request`
- `spec_author` renders then dispatches through the injected executor
- `spec_author` returns the doctor diagnostic and never dispatches
- `spec_execute` input schema accepts name/phase/focus/mode/model
- `spec_execute` derives state/budget, renders, dispatches, and passes skills
- omitted name resolves from the branch before dispatch
- ambiguous branch fails with the diagnostic and never dispatches
- unknown mode fails and never dispatches
- no model and no default fails without dispatching

`apps/cli/tests/run-slash.test.ts` (+5):

- author prose values join across spaces and render
- `author` without `--request` is a usage failure
- `execute --name` renders with the derived budget
- `execute --mode autonomous` works and `autopilot` is refused
- unknown spec renders as a diagnostic

`src/tests/server.test.ts` (+1):

- registers `spec_author` then `spec_execute`
- `COMMAND_DESCRIPTION` lists `/specs author` and `/specs execute`

## Open Questions

1. **`--phase` scope.** It validates the phase and computes that phase's
   budget, but the ready set is always the active phase's (the only ready set
   the CLI derives). If the phase is not active, the prompt restricts a
   session whose ready set belongs to another phase. A phase-scoped `next`
   would be the cleaner fix but is not in C003's contract.
2. **`resolveRepoRoot` with a relative start.** `resolveRepoRoot('.')` stops
   immediately because `path.dirname('.') === '.'`. `workspaceRoot` therefore
   passes `process.cwd()`. Doctor's own default (`runDoctorAt('.')` via
   `mf-specs doctor` with no `--dir`) has the same pre-existing limitation;
   fixing it is a doctor change outside this task.
3. **No hidden-model test for the binary.** "The binary never dispatches" is
   proven by the engines' requirement list (no `ModelPort` /
   `SessionDispatchPort`) and by every engine test running with stores only.
   A source-grep guard would be brittle and was not added.
4. **`spec_execute` model fallback.** An omitted `model` uses
   `ports.model.default()`; when the host has no default either, the tool fails
   with a one-line instruction instead of dispatching an unresolvable label.

## Handoff

- **C005**: `apps/cli/CONTEXT.md` is current for the verbs, slash forms, and
  the workspace-root default. The README still needs its author/execute docs
  pass; it was not touched here.
- **C099 / reviewers**: the execute engine refuses any tree `check` calls
  invalid, not just a missing spec. Decide whether that is the intended
  strictness or whether only config/task-size errors should block.
- **D003**: `Prompt.load(..., { ..., mode })` and the `PromptError` →
  `diagnoseCause` arm are now reusable; `sizing-config` should copy neither.
- **Server wiring**: `runSlash` requires `PromptStore.PromptStore`; any new
  caller must provide it. `CommandLive` in `server.ts` and the CLI `stubLayer`
  already do. Host tools are built by `apps/server`'s factories and registered
  with `defineTool`.

## Deviations

- **Author and execute default to the nearest repository root.** TASK's
  completion commands run through `bun run --cwd packages/specs cli …`, where
  `.` is the package directory and has no `.agents/@montflow/prompts`. The two
  commands now resolve `--dir` (when omitted) with `resolveRepoRoot(
  process.cwd())`; an explicit `--dir` is untouched. Other verbs keep their
  existing default.
- **A verifier-invalid spec is refused, not rendered.** TASK says both
  commands refuse an invalid spec; this is read as "any error `check` reports",
  so the prompt never reaches a worker on an invalid tree.
- **Two new surface codes** (`spec.phase-not-found`, `spec.no-active-phase`)
  were needed for the phase and no-active-phase refusals; prompt failures reuse
  C001's `prompt.*` codes unchanged.
- **Slash prose joining** applies only to `request`, `notes`, and `focus`, so
  existing single-token flags keep their behaviour.
- **`@montflow/prompts` gained an `apps/server` namespace export.** The
  factory already existed; only the public barrel changed.
- **No `BOARD.md` broadcast**: this phase has no `BOARD.md`, and this run may
  write only its own `MEMORY.md`.
- **No git commit**, per the worker contract.
