# Memory

## Context

D002 `sizing-prompt` ships the third canonical spec prompt, `spec-sizing`: the
guided wizard that shows the existing config, asks for repo / spec / phase scope,
inventories the live harness catalogue, proposes all four sizes, confirms, writes
exactly one layer, and proves it. The role ships as the
`spec-sizing-orchestrator` profile.

Worktree `/home/daniel/dev/montflow/spec-optimizations`, branch
`feat/spec-optimizations`. Depends on D001 (catalogue shape and `spec_models`) and
C001/C002/C003 (prompt loader, modes, commands).

Scope held to D002: the prompt file, the profile, doctor's third owned prompt
(`SPEC_PROMPT_NAMES`, embedded payload, workspace sync), loader proof/tests, and
the prompt tests. No `sizing-config` command (D003), no README/skill/profile docs
pass (D004), no `SPEC.md`, task status, lock, or other task record edits, no
`ask_user`, no git commit.

## Progress

Done.

Files added:

- `packages/specs/prompts/spec-sizing.json` — canonical prompt. Name
  `spec-sizing`; variables in first-appearance order `scope`, `name`, `phase`,
  `unsupervised`, `focus`; skills `executing-skills`, `montflow-find-specs`,
  `montflow-create-specs`, `grilling`, `i-have-adhd`; `model` empty.
- `.agents/@montflow/profiles/spec-sizing-orchestrator/PROFILE.md` — role with
  the same five skills, `# Spec Sizing Orchestrator`, `## Instructions`, and
  `## Review Checklist`.
- `packages/specs/src/modules/prompt/tests/sizing-prompt.test.ts` — 11 tests:
  canonical file verification, variable bijection, declared skills, the wizard
  contract, open/repo/spec/phase renders, guided vs autonomous, missing/stale
  doctor gate, and fixture-catalogue constraints.
- `.agents/@montflow/prompts/spec-sizing.json` — installed by
  `mf-specs doctor`, never hand-edited.

Files modified:

- `packages/specs/src/apps/doctor/doctor.apps.module.ts` — `SPEC_PROMPT_NAMES`
  is now `['spec-create', 'spec-execute', 'spec-sizing']`.
- `packages/specs/src/apps/doctor/embedded-payload.generated.ts` — regenerated
  with `bun run --cwd packages/specs generate:payload` (2 skills, 3 prompts).
- `packages/specs/src/apps/doctor/tests/doctor.test.ts` — prompt expectations
  widened from two to three; "accepts every canonical prompt".
- `packages/specs/src/apps/cli/tests/doctor.test.ts` — drifted payload count
  `4 -> 5`.
- `packages/specs/src/modules/prompt/prompt.module.ts` — JSDoc now lists
  `spec-sizing` alongside the other two.
- `packages/specs/src/modules/prompt/tests/prompt.test.ts` — unknown-prompt
  expected list now `spec-create, spec-execute, spec-sizing`.

Behaviour landed:

- The template opens with `Scope state:` and, when fixed, names the scope, the
  spec/phase identifiers, and the exact write target:
  `<specs-root>/sizing.json` for repo, `<spec>/sizing.json` for spec, and
  `phases.<phase>.sizes` inside the spec file for phase. The repo file is stated
  to carry `sizes` only and never a `phases` key. Open scope states that the
  layer must be asked before any write.
- Step 1 reads the repo config verbatim, runs `mf-specs list`, and for a fixed
  spec/phase also runs `mf-specs status --name <spec>` and reads that config;
  step 2 asks the layer when open, then reads and shows the chosen spec mapping.
- Step 3 reads `spec_models` `list` (or `mf-specs models --catalog`), and states
  the effort rule exactly: `null` = unknown (no finding, no effort), `[]` =
  known-empty (no effort), non-empty = an effort is allowed only for an exact
  listed token.
- Step 4 proposes `tiny`, `small`, `medium`, `large` explicitly as
  `provider/model[#effort]` or explicit `inherit`, with one line of reasoning
  per size; no-change runs write nothing.
- Step 5 shows the exact JSON and path and waits for confirmation; a different
  non-empty value needs an extra overwrite permission.
- Step 6 merges, preserves unrelated sizes / `phases` / keys, emits `sizes`
  then `phases`, 2-space JSON with a trailing newline, and writes one layer per
  run.
- Step 7 proves with the catalogue verify action (or
  `mf-specs models --verify --catalog`), `mf-specs check` for the touched scope,
  and `mf-specs sizing --task <id> --human` for one task per explicit target; a
  failing check blocks the report.
- The `{{#if unsupervised}}` branch decides scope, proposal, and overwrite,
  records one line per call, and continues; the guided branch asks at exactly
  the three checkpoints. Hard bounds forbid `TASK.md`, task-size, `SPEC.md`,
  status/lock edits, invented ids, out-of-scope writes, and pre-resolution
  writes.

## Findings

- `Prompt.load` required no new registry: `PROMPT_NAMES` re-exports doctor's
  `SPEC_PROMPT_NAMES`, and the loader already folds the public `mode` into
  `unsupervised`. Because `spec-sizing` declares `unsupervised`, `mode:
  'autonomous'` renders the autonomous branch with no loader change.
- The prompt declares no model id and no literal effort token. A fixture-driven
  test decodes `packages/specs/fixtures/catalog.json` and checks every model
  label and every known variant token is absent from the template; a live render
  check repeats the same assertion over all five renders.
- Live `mf-prompts render` speaks the raw variable name, not the spec loader's
  reserved `mode` key: autonomous live renders pass `unsupervised=autonomous`.
  The loader test uses `mode=autonomous`, which is what D003 should pass.
- Doctor tests hardcoded two prompts in several arrays. They now expect three,
  and the CLI doctor report count moved from four payload lines to five. The
  embedded-payload test already iterates `SPEC_PROMPT_NAMES`, so regeneration
  was the only other requirement.
- The canonical and installed prompt bytes are identical; the final sync was a
  doctor repair after the last template edit.

## Evidence

### Gates (verbatim, after the final edit)

```
$ bun run --cwd packages/specs test
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.4 /home/daniel/dev/montflow/spec-optimizations/packages/specs


 Test Files  82 passed (82)
      Tests  943 passed (943)
Type Errors  no errors
   Start at  16:49:41
   Duration  2.82s (import 82%, tests 11%, transform 5%, typecheck 1%, worker 1%)
```

```
$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
(node:1615769) [MODULE_TYPELESS_PACKAGE_JSON] Warning: ...
...
exit 0
```

The only lint output beyond the script echo is Node's
`MODULE_TYPELESS_PACKAGE_JSON` notice for root/tooling config; it is not a
finding.

```
$ bun run --cwd packages/specs format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 589ms on 151 files using 16 threads.
exit 0
```

```
$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
exit 0
```

```
$ bun run mf:check
...
46 skills · 0 issues
5 prompts · 0 issues · 0 warnings
6 specs · 0 failed · 0 issues · 79 warnings
✓ spec skills and prompts are installed and up to date.
✓ spec-sizing: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-sizing.json
12 profiles · 0 issues · 0 warnings
8 files · 0 issues
EXIT=0
```

The 79 warnings are the pre-existing `task.missing-size` advisories on historical
completed tasks; every scope reports zero issues. `mf:check:profiles` alone
reported `12 profiles · 0 issues · 0 warnings`, and `mf:check:prompts` reported
`5 prompts · 0 issues · 0 warnings`.

### Doctor sync (verbatim)

```
$ bun run --cwd packages/specs cli doctor --dir "$PWD"
+ spec skills and prompts installed or repaired.
✓ montflow-create-specs: already installed → .../.agents/skills/montflow-create-specs
✓ montflow-find-specs: already installed → .../.agents/skills/montflow-find-specs
✓ spec-create: already installed → .../.agents/@montflow/prompts/spec-create.json
✓ spec-execute: already installed → .../.agents/@montflow/prompts/spec-execute.json
+ spec-sizing: repaired ('spec-sizing.json' differed from the package) → .../.agents/@montflow/prompts/spec-sizing.json
```

An earlier repair run installed `spec-sizing`; the final run repaired it after
the last template edit. `doctor --check` inside `mf:check` reports it up to date.

### Canonical / installed identity

```
$ sha256sum packages/specs/prompts/spec-sizing.json .agents/@montflow/prompts/spec-sizing.json
14ab909d04f3a3354e4bca68c4ad60e27f5f92ec036317225aee8cf41d47d6c8  packages/specs/prompts/spec-sizing.json
14ab909d04f3a3354e4bca68c4ad60e27f5f92ec036317225aee8cf41d47d6c8  .agents/@montflow/prompts/spec-sizing.json
```

### Live renders (verbatim excerpts)

Workspace prompt, four scopes plus autonomous:

```
$ bun run --cwd packages/prompts cli render spec-sizing --dir "$PWD"
Scope is open: no layer is selected. Ask which layer before any write. Nothing may be written until the scope and the proposal are resolved.

$ bun run --cwd packages/prompts cli render spec-sizing --dir "$PWD" scope=repo
Scope: repo (fixed for this run; do not ask which layer).
- `repo` -> `<specs-root>/sizing.json`, by default `.agents/@montflow/specs/sizing.json`, with `sizes` only and never a `phases` key.

$ bun run --cwd packages/prompts cli render spec-sizing --dir "$PWD" scope=spec name=spec-optimizations
Scope: spec (fixed for this run; do not ask which layer).
Spec: spec-optimizations. Its config is `spec-optimizations/sizing.json`.

$ bun run --cwd packages/prompts cli render spec-sizing --dir "$PWD" scope=phase name=spec-optimizations phase=D
Scope: phase (fixed for this run; do not ask which layer).
Spec: spec-optimizations. Its config is `spec-optimizations/sizing.json`.
Phase: D. The write target is `phases.D.sizes` inside `spec-optimizations/sizing.json`.

$ bun run --cwd packages/prompts cli render spec-sizing --dir "$PWD" scope=repo unsupervised=autonomous
Autonomous run: decide the scope, the proposal, and any overwrite yourself, record one line per call in the report or the task's `MEMORY.md`, and continue without asking.
```

The guided repo render instead carries:

```
Guided run: wait for the user at each of the three points before moving on; an unanswered proposal is never written.
```

The open render's section order is `1 Show`, `2 Resolve scope`, `3 Catalogue`,
`4 Propose`, `5 Confirm`, `6 Merge`, `7 Prove`, `8 Interaction mode`,
`9 Hard bounds`.

### Fixture-catalogue constraint check (verbatim)

`mf-specs models --json --catalog fixtures/catalog.json` produced the catalogue
document; the rendered prompt was then checked against every label and known
variant:

```
open: 5650 bytes, no catalogue model id or variant token
repo: 5841 bytes, no catalogue model id or variant token
spec: 5915 bytes, no catalogue model id or variant token
phase: 6005 bytes, no catalogue model id or variant token
autonomous: 6020 bytes, no catalogue model id or variant token
EXIT=0
```

The unit test `carries no model id or variant token from the fixture catalogue`
pins the same rule, and `states the null / [] / known-variants rule
unambiguously` pins the exact wording. No test writes a real `sizing.json` into
the workspace; all renders and gates use throwaway temp roots or read-only fixture
files.

### Test inventory

`packages/specs/src/modules/prompt/tests/sizing-prompt.test.ts` (11):

1. verifies the canonical file, the five variables in order, and the five skills
2. carries the wizard contract and all four sizes
3. open scope asks before any write
4. repo scope names the repo file and forbids a `phases` key
5. spec scope names the spec and its file
6. phase scope names the phase and the nested write target
7. guided default vs autonomous decides the three checkpoints
8. missing prompt fails `prompt.missing` with the doctor fix and writes nothing
9. stale prompt fails `prompt.stale` with the doctor repair
10. states the `null` / `[]` / known-variants rule unambiguously
11. carries no model id or variant token from the fixture catalogue

## Open Questions

1. **D003 overlap.** D003's TASK also names "extend doctor's owned set to
   `spec-sizing.json`". This run already did that (plus embedded payload and
   workspace sync) because the subagent instruction assigned it to D002. D003
   should treat that part as landed and focus on `sizing-config`, `spec_sizing`,
   `/specs sizing-config`, and the docs.
2. **Stale prose still says two prompts.** `packages/specs/src/apps/doctor/CONTEXT.md`,
   `packages/specs/src/modules/prompt/CONTEXT.md`, `packages/specs/README.md`,
   and `packages/specs/src/apps/cli/CONTEXT.md` still enumerate only
   `spec-create` and `spec-execute`. D003 explicitly owns the doctor docs and
   CLI CONTEXT; D004 owns the README/skill/profile pass. They were not edited
   here.
3. **`mf-prompts render` does not accept `mode`.** It is a generic renderer over
   the declared variables, so live autonomous renders pass
   `unsupervised=autonomous`. D003's `sizing-config` must pass `mode` through
   the spec loader, which maps it correctly (unit-tested here).
4. **No `spec-sizing` command yet.** The binary path
   `mf-specs sizing-config ...` and the host tool/slash form remain D003.

## Handoff

- **D003**: `spec-sizing.json` is canonical, installed, and doctor-owned.
  `Prompt.load(root, 'spec-sizing', { scope, name, phase, mode, focus })` works;
  `mode` maps to `unsupervised` inside the loader. Reuse `diagnoseCause`'s
  `PromptError` arm, derive the scope mechanically with `--scope` winning over
  `--name`/`--phase`, and keep the command write-free.
- **D004**: the README and authoring skill still need the wizard order,
  catalogue-driven generation, effort-from-variants, open vs fixed scope,
  `inherit`, merge, and proof loop; also the handoff sentence pointing creation
  and execution at `spec-sizing-orchestrator`.
- **Reviewers**: judge (a) the template opens with scope state and names the
  exact write path, (b) step 1 shows existing config before any question,
  (c) step 3's `null` / `[]` / exact-token rule is unambiguous and no literal
  model id or variant token appears, (d) step 4 proposes all four sizes
  explicitly with `inherit` honest, (e) step 5 asks before writing and before a
  non-empty overwrite, (f) step 6 preserves unrelated entries and never adds
  `phases` to the repo file, (g) step 7 verifies with catalogue verify, `check`,
  and `sizing --human`, and (h) the profile and all doctor/prompt tests pass.

## Deviations

- **Doctor wiring landed in D002.** D003's TASK also claims the owned-set
  extension; the subagent instruction for this run explicitly assigned
  `SPEC_PROMPT_NAMES`, the embedded payload, and the workspace sync to D002, so
  it was done here. D003 must not duplicate it.
- **No docs edits.** README, the authoring skill, and the module/CONTEXT prose
  still need their pass; D003 and D004 own that. Only code JSDoc and tests were
  updated.
- **No `sizing-config` command, host tool, or slash form.** D003 owns them.
- **Tests use fixture catalogues and throwaway roots only.** No real
  `sizing.json` was written into the workspace, and no model id was committed as
  test data.
- **`format:fix` was run package-wide after `format:check` flagged exactly the
  new test file.** The check had named only
  `src/modules/prompt/tests/sizing-prompt.test.ts`, and the re-run passes clean.
- **No `BOARD.md` broadcast**: this phase has no `BOARD.md`, and this run may
  write only its own `MEMORY.md`.
- **No git commit**, per the worker contract.
