# Memory

## Context

Task E001 (validate-names) from `spec-optimizations`. The audit found every
spec-name surface trusted `--name` / `--phase`: `status --name ..` read the
specs parent recursively (mixing every spec's tasks) and `sizing-config --name
../../etc` rendered a write target outside the specs root. Only `create`
validated a name.

Scope: `packages/specs`. Design chosen:

- `modules/spec` keeps the grammar and gains `isValidPhase` beside
  `isValidName` (`SLUG_PATTERN` / `PHASE_PATTERN` remain the only rules).
- `apps/cli/cli.apps.module.ts` owns one exported `guardSpecName` and one
  exported `guardPhase`, each returning an agent-first `SizingDiagnostic` with
  `code cli.invalid-argument`, `field --name` / `--phase`, the rejected value as
  `actual`, the grammar as `expected`, and a `fix` naming a valid slug/phase id.
  A tiny `guardFailure(operation, refusal)` lifts a refusal into the
  `SurfaceError` the CLI renders.
- Guards run at the top of the shared functions, so the CLI binary, the slash
  arms, `spec_execute`, `spec_sizing`, and `spec_models` all inherit one check:
  `status`, `next`, `sizingOf` (resolve + sizing), `verifyModels`
  (`models --verify --name`), `execute`, `sizingConfig`, and — see Findings —
  `check`. `state` delegates to `status`, so its guard runs first too.
- Nothing is read before the guard: the tests provide a store whose every
  method is a defect, so a missed guard fails the test instead of reading a
  path outside the specs root.

## Progress

- Added `isValidPhase` to `packages/specs/src/modules/spec/spec.module.ts`.
- Added `guardSpecName`, `guardPhase`, and `guardFailure` to
  `packages/specs/src/apps/cli/cli.apps.module.ts`; applied them at every listed
  boundary before any store read or prompt render.
- Blank `--name` is refused everywhere through the shared guard (the existing
  scope-aware blank-name refusal in `resolveSizingScope` still wins for
  `sizing-config`, with the same code/field and a slug fix).
- Blank `--phase` remains "absent" for `execute` / `sizing-config`, preserving
  the documented convention and the existing tests.
- Slash arms: their pre-checks now delegate a blank name to the shared guard
  instead of a `store.error` (`status`, `state`, `next`, `resolve`/`sizing`);
  non-blank malformed values already flow through the shared functions.
- Added table-driven tests in
  `packages/specs/src/apps/cli/tests/validate-names.test.ts`: every guarded
  surface × `..`, `../../etc`, `.`, `/etc/passwd`, `a/b`, `a\b`, `Spec`,
  `ship spec`, `A`, empty, whitespace (slash forms use the token-safe subset and
  `--name=` for blank); phase surfaces × `..`, `../../etc`, `.`, `/etc/passwd`,
  `a/b`, `a\b`, `Spec`, `a`, `A1`, `AA B`. Asserts code, field, fix, `actual`,
  exit code (direct surfaces via `diagnoseCause`) / `ok: false` (slash arms), and
  that no `A001` task, `sizing.json`, or write-target text leaks.
- Added `packages/specs/src/modules/spec/tests/is-valid-phase.test.ts`.
- Added the D003 regression test in
  `packages/specs/src/apps/cli/tests/sizing-config.test.ts`: a well-formed but
  unknown spec and phase still render the wizard and name the target.
- CLI spot checks: `state`, `next`, `resolve`, `sizing`, `execute`, `models
  --verify`, `sizing-config --phase a` all exit `1` with
  `cli.invalid-argument`; `sizing-config --name unknown-spec --phase B` exits `0`
  and renders the wizard.
- Re-verified after the sibling E002 edits (formatting/docs/prompt race) landed
  in the shared worktree: all four Stage 0 commands and every Stage 1 command
  were re-run against the current tree and pass; the Gate section below holds
  the current run's verbatim output.

## Findings

- `check --name` was not in TASK.md's list but is a spec-name surface and
  SPEC.md requirement 153 says every surface validates. It now runs the same
  guard (before `hasRoot`); `check`'s error channel gained `SurfaceError`.
- `verifyModels` used to treat `--name ''` as "repo config only". A supplied
  blank name is now refused like every other blank name.
- `execute` used to trim `--name` / `--phase`; raw padded values are now
  refused as outside the grammar (padded whitespace was the only accepted
  out-of-grammar form). The exported `resolveSizingScope` helper still trims
  before it validates, so callers that bypass `sizingConfig` keep the old
  normalization; the command boundary is strict.
- D003 is intact: only malformed identifiers are refused; well-formed unknown
  slugs still reach `spec.not-found` (`status`, `sizing`, `models --verify`) or
  render the sizing wizard (`sizing-config`).
- The worktree is shared with the E002 worker: `author-execute.test.ts`,
  `prompt.module.ts`, `skill-gate.test.ts`, docs, skills, and the doctor payload
  were mid-edit during this task. A package-wide `format:fix` (run to satisfy
  `format:check`) also reformatted those in-progress files; none of their
  content was authored or reverted here. `ts:check` briefly reported an unused
  import from that race and passed on re-run.

## Open Questions

- GATES.md Stage 1 line 3 says `cli status --dir . --name spec-optimizations`.
  Under `bun run --cwd packages/specs`, `.` is `packages/specs`, so the store is
  not found and it exits `1` with `store.error` (unrelated to this change). The
  task brief says the CLI takes `--dir <repo root>`; from the package cwd that
  is `../..`, and the same command with `--dir ../..` prints the panel and exits
  `0` (evidence below). Orchestrator may want to correct the gate text.
- Should a blank `--phase` be refused rather than treated as absent? Current
  behavior treats it as absent for `execute` / `sizing-config`, and existing
  tests pin that. Left unchanged; noted for a future decision.

## Handoff

- E002 (skill-gate) owns the other in-flight edits in this worktree; do not
  revert the docs/prompt/test changes that appear in `git status`.
- E003 (dispatch-truth) can rely on `guardSpecName` / `guardPhase` from
  `apps/cli/index.ts`; add new name surfaces by calling them before the first
  store read, not by re-implementing the regex.
- G004 (split-cli) should carry the guard section into its new command module
  unchanged; it is the only place `cli.invalid-argument` is built for names and
  phases.

## Gates

### Stage 0: Verification

Command: `bun run --cwd packages/specs test`

```
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when they do.

 RUN  v5.0.4 /home/daniel/dev/montflow/spec-optimizations/packages/specs


 Test Files  90 passed (90)
      Tests  1092 passed (1092)
Type Errors  no errors
   Start at  16:44:18
   Duration  2.78s (import 81%, tests 13%, transform 4%, typecheck 1%, worker 1%)
```

Command: `bun run --cwd packages/specs lint:check`

```
$ oxlint --deny-warnings .
(node:974974) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/spec-optimizations/oxlint.config.ts?cache=1793220264094 is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:974974) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/spec-optimizations/tooling/oxlint/anti-slop/effect/index.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/tooling/oxlint/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
```

Command: `bun run --cwd packages/specs format:check`

```
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 561ms on 155 files using 16 threads.
```

Command: `bun run --cwd packages/specs ts:check`

```
$ tsc --noEmit
```

### Stage 1: Behaviour

Command: `bun run --cwd packages/specs cli status --dir . --name ..`

```
$ bun run src/apps/cli/main.ts status --dir . --name ..
code     cli.invalid-argument
path     --name
field    --name
problem  Spec name '..' is not a slug.
expected a slug matching ^[a-z0-9]+(?:-[a-z0-9]+)*$ (e.g. 'ship-login')
actual   '..'
fix      Pass a lowercase kebab-case spec slug such as 'ship-login'.
next     mf-specs list
error: script "cli" exited with code 1
EXIT=1
```

No parent task line is printed: the store is never read.

Command: `bun run --cwd packages/specs cli sizing-config --dir . --name ../../etc`

```
$ bun run src/apps/cli/main.ts sizing-config --dir . --name ../../etc
code     cli.invalid-argument
path     --name
field    --name
problem  Spec name '../../etc' is not a slug.
expected a slug matching ^[a-z0-9]+(?:-[a-z0-9]+)*$ (e.g. 'ship-login')
actual   '../../etc'
fix      Pass a lowercase kebab-case spec slug such as 'ship-login'.
next     mf-specs list
error: script "cli" exited with code 1
EXIT=1
```

No write target (`sizing.json` / `phases.*.sizes`) is named anywhere.

Command: `bun run --cwd packages/specs cli status --dir . --name spec-optimizations`

```
$ bun run src/apps/cli/main.ts status --dir . --name spec-optimizations
code     store.error
path     spec-optimizations
field    root
problem  Specs directory not found: .agents/@montflow/specs
fix      Pass --dir <repo root> (the directory holding .agents/@montflow/specs) and re-run the command.
next     mf-specs check --name spec-optimizations
error: script "cli" exited with code 1
EXIT=1
```

This is the cwd artifact described in Open Questions (`bun run --cwd` puts the
process in `packages/specs`, so `.` holds no store). The same command with the
repo root passed as the brief specifies, `--dir ../..`:

Command: `bun run --cwd packages/specs cli status --dir ../.. --name spec-optimizations`

```
$ bun run src/apps/cli/main.ts status --dir ../.. --name spec-optimizations
spec-optimizations · in-progress · worktree
state pending
author Daniel Montilla · created 2026-10-26 · locked A,B,C,D
tasks 36 · 21 complete · 15 pending
verify ✓ verified
sizing none

Phase A · locked · budget 3 · sizes small,medium
  sizes tiny inherit · small inherit · medium inherit · large inherit
  ✓ A001  contract                 execution  medium  inherit
  ✓ A002  surfacing                execution  small  inherit
  ✓ A003  wire-authoring           execution  small  inherit
  ✓ A004  backfill                 execution  small  inherit
  ✓ A099  review-phase             review  small  inherit

Phase B · locked · budget 3 · sizes small,medium
  sizes tiny inherit · small inherit · medium inherit · large inherit
  ✓ B001  prompt-store-rename      execution  medium  inherit
  ✓ B002  prompt-sync              execution  small  inherit
  ✓ B003  skills-rename            execution  medium  inherit
  ✓ B004  live-refs                execution  medium  inherit
  ✓ B099  review-phase             review  small  inherit

Phase C · locked · budget 3 · sizes small,medium
  sizes tiny inherit · small inherit · medium inherit · large inherit
  ✓ C001  prompt-templates         execution  medium  inherit
  ✓ C002  execute-modes            execution  small  inherit
  ✓ C003  author-execute-commands  execution  medium  inherit
  ✓ C004  spec-detection           execution  medium  inherit
  ✓ C005  docs-and-profiles        execution  small  inherit
  ✓ C099  review-phase             review  small  inherit

Phase D · locked · budget 3 · sizes small,medium
  sizes tiny inherit · small inherit · medium inherit · large inherit
  ✓ D001  model-catalogue          execution  medium  inherit
  ✓ D002  sizing-prompt            execution  medium  inherit
  ✓ D003  config-command           execution  medium  inherit
  ✓ D004  docs-and-handoffs        execution  small  inherit
  ✓ D099  review-phase             review  small  inherit

Phase E · budget 3 · sizes tiny,small,medium
  sizes tiny inherit · small inherit · medium inherit · large inherit
  ○ E001  validate-names           execution  small  inherit
  ○ E002  skill-gate               execution  medium  inherit
  ○ E003  dispatch-truth           execution  small  inherit
  ○ E004  docs-truth               execution  tiny  inherit
  ○ E099  review-phase             review  small  inherit

Phase F · budget 3 · sizes small,medium
  sizes tiny inherit · small inherit · medium inherit · large inherit
  ○ F001  warning-grouping         execution  small  inherit
  ○ F002  record-checks            execution  medium  inherit
  ○ F003  surface-nits             execution  small  inherit
  ○ F099  review-phase             review  small  inherit

Phase G · budget 3 · sizes small,medium,large
  sizes tiny inherit · small inherit · medium inherit · large inherit
  ○ G001  catalogue-proof          execution  medium  inherit
  ○ G002  single-snapshot          execution  small  inherit
  ○ G003  shared-json              execution  medium  inherit
  ○ G004  split-cli                execution  large  inherit
  ○ G005  doctor-module            execution  medium  inherit
  ○ G099  review-phase             review  small  inherit
EXIT=0
```

## Deviations

- Added the same guard to `check --name` (not in TASK.md's list, but a
  spec-name surface per SPEC.md requirement 153).
- `format:fix` was run package-wide to satisfy `format:check`; it reformatted
  in-progress sibling (E002) files in this shared worktree. No sibling content
  was authored, edited, or reverted.
- Stage 1 line 3 was executed twice: verbatim (fails on cwd) and with the repo
  root as the brief specifies (`--dir ../..`, passes). See Open Questions.

## Orchestrator gate re-run (2026-10-28, independent of the worker)

Every command below was re-run by the orchestrator against the post-E002 tree.

Stage 0, all four, exit 0:

```
$ bun run --cwd packages/specs test
 Test Files  90 passed (90)
      Tests  1092 passed (1092)
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

```
$ bun run --cwd packages/specs cli status --dir . --name ..
code     cli.invalid-argument
path     --name
field    --name
problem  Spec name '..' is not a slug.
expected a slug matching ^[a-z0-9]+(?:-[a-z0-9]+)*$ (e.g. 'ship-login')
actual   '..'
fix      Pass a lowercase kebab-case spec slug such as 'ship-login'.
next     mf-specs list
EXIT=1

$ bun run --cwd packages/specs cli sizing-config --dir . --name ../../etc
code     cli.invalid-argument
path     --name
field    --name
problem  Spec name '../../etc' is not a slug.
expected a slug matching ^[a-z0-9]+(?:-[a-z0-9]+)*$ (e.g. 'ship-login')
actual   '../../etc'
fix      Pass a lowercase kebab-case spec slug such as 'ship-login'.
next     mf-specs list
EXIT=1
```

Stage 1 line 3, verbatim: `--dir .` exits `1` with `store.error` (`Specs
directory not found: .agents/@montflow/specs`) because `bun run --cwd
packages/specs` makes `.` the package directory. The gate's own subject — a
valid slug still prints the spec panel — is proven with the repo root the CLI
contract names:

```
$ bun run --cwd packages/specs cli status --dir ../.. --name spec-optimizations
spec-optimizations · in-progress · worktree
state pending
author Daniel Montilla · created 2026-10-26 · locked A,B,C,D
tasks 36 · 21 complete · 15 pending
verify ✓ verified
sizing none
EXIT=0
```

Orchestrator decision: the `--dir .` spelling is a gate-text cwd artifact (17
other gate lines in this spec use it, including the locked A-D phases); the
substantive assertion passes at the repo root the CLI expects. GATES.md was not
edited. E001 completes on that evidence.
