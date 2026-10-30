# Memory

## Context

C001 `prompt-templates`: make `packages/specs/prompts/` the only source of the
author and execute prompt text. The two canonical prompts become the contract
this spec actually ships (request/notes for authoring; name/state/next/
reviewBudget plus phase/focus/unsupervised for execution, with the review-cycle
budget and the hard cap of 3 enforced in the template). `modules/prompt` stops
concatenating TypeScript strings and becomes a loader/renderer over
`@montflow/prompts`, gated on `mf-specs doctor`. `src/skills/` and its drift test
are deleted. Doctor keeps owning the workspace copies.

Worktree `/home/daniel/dev/montflow/spec-optimizations`, branch
`feat/spec-optimizations`. Depends on A003 (sizing prose), B002 (doctor prompt
sync), B004 (live refs), C004 (`which`, already landed).

Out of scope and untouched: `author`/`execute` CLI commands and host tools
(C003), branch detection (C004), the full README/profile/skill docs pass (C005),
`SPEC.md`, task statuses, locks, profiles, and other task records.

## Progress

Done.

Files added:

- `packages/specs/prompts/spec-create.json` — rewritten canonical prompt.
  Variables `request` (required) then `notes` (optional); skills
  `montflow-create-specs`. Describes the current tree (`SPEC.md` plus one
  directory per task), `mf-specs create`, task ids/phases as leading letters,
  sizes and the review-cycle budget, config layering/`inherit`, and the
  verifier. No tier, appraiser, `PHASE.md`, `new-phase`, or `new-task` prose.
- `packages/specs/prompts/spec-execute.json` — rewritten canonical prompt.
  Variables in first-appearance order `name`, `state`, `next`, `reviewBudget`,
  `phase`, `focus`, `unsupervised`; skills `montflow-find-specs`,
  `montflow-adversarial-review`, `montflow-addressing-adversarial-review`.
  Reads derived state/ready set as truth, dispatches by `inherit`/target, gates,
  then holds the budget: open a round only while the series count is below
  `{{reviewBudget}}`, refuse a round past it (including a fourth when the cap is
  3), escalate every leftover finding with `ask_user`, and never lock an
  unreviewed phase. States that a tiny-only phase gets exactly one reviewer
  round, and that a cycle is a reviewer round, not a per-finding attempt.
  `unsupervised` carries the minimal guided/autonomous interaction branches.
- `packages/specs/src/modules/prompt/tests/prompt.test.ts` — rewritten loader
  tests (9 cases), including both renders, declared skills, optional notes,
  guided vs autonomous, the review budget/refusal, missing/stale/unknown prompt
  failures, and a missing required variable.

Files modified:

- `packages/specs/src/modules/prompt/prompt.module.ts` — loader/renderer:
  `PROMPT_NAMES`, `CODES`, `DOCTOR_FIX`, `PromptError`, `LoadedPrompt`, `load`.
  It calls `runDoctor(root, { check: true })` first, fails `missing` / `stale` /
  `blocked` with the installed file path and the doctor fix, then reads through
  `PromptStore.readRaw`, verifies with `Prompts.verifyPromptFile`, decodes with
  `Prompts.FromJson`, checks `Prompts.missingRequired`, and renders with
  `Prompts.renderPrompt`. No template text or skill body in TypeScript.
- `packages/specs/src/modules/prompt/CONTEXT.md` — loader contract, doctor gate,
  ownership split with `@montflow/prompts` / doctor / CLI.
- `packages/specs/src/index.ts` — removed the dead `SpecSkill` export.
- `packages/specs/package.json` — added `"@montflow/prompts": "workspace:*"`.
- `bun.lock` — one line, written by `bun install`.
- `packages/specs/src/apps/doctor/embedded-payload.generated.ts` — regenerated
  with `bun run --cwd packages/specs generate:payload` so the compiled binary
  embeds the new prompt bytes.
- `packages/specs/README.md` — minimal library-surface edit: the `Prompt` bullet
  now describes the loader and `packages/specs/prompts/`; the dead `SpecSkill`
  bullet is gone (needed for the TASK grep gate).
- `.agents/@montflow/prompts/spec-create.json` and `spec-execute.json` — written
  by `mf-specs doctor`, never hand-edited.

Files deleted:

- `packages/specs/src/skills/` (index, `authoring-spec.ts`, `executing-spec.ts`,
  `CONTEXT.md`, `tests/skill-drift.test.ts`).

No edit was needed in `src/modules/index.ts`: it already exports
`export * as Prompt from './prompt/index.js'`.

## Findings

### Loader design

- `load(root, name, values)` is an Effect requiring `PromptStore.PromptStore`.
  `root` is the **workspace root** that owns `.agents/@montflow/prompts/`, not
  the specs store directory.
- Doctor's own comparison is the gate, not a second implementation. A requested
  prompt reported `missing`, `stale`, or `blocked` fails before the file is read;
  a stale unrelated skill never blocks a prompt render. `--check` semantics mean
  the loader writes nothing.
- Every refusal carries `code`, `path`, `field`, `problem`, optional `expected` /
  `actual`, `cause`, and a required `fix` that names `mf-specs doctor`. Codes:
  `prompt.unknown`, `prompt.missing`, `prompt.stale`, `prompt.blocked`,
  `prompt.read`, `prompt.invalid`, `prompt.missing-variable`, `prompt.render`.
- `PROMPT_NAMES` re-exports doctor's `SPEC_PROMPT_NAMES`, so there is one list.
- Values are passed through untouched; required-value enforcement is
  `Prompts.missingRequired`, so an empty required value fails as
  `prompt.missing-variable` instead of rendering a silent blank.

### Prompt contract decisions

- `notes` sits immediately after `request` in the template, so the declared order
  stays `request`, `notes` (the verifier requires first-appearance order).
- `phase` and `focus` are referenced in section 7 "Session limits" and
  `unsupervised` in section 8 "Interaction mode", matching the declared order
  `reviewBudget`, `phase`, `focus`, `unsupervised`.
- The execute template names the budget in three ways — the budget line, the
  "below `{{reviewBudget}}`" rule, and "a fourth round is refused even when the
  cap is 3" — and states the tiny-only phase case explicitly.
- The authoring prompt no longer mentions tiers, a `spec-appraiser`, phase
  directories, `PHASE.md`, `new-phase`, or `new-task`. It names only `create` as
  the scaffold verb, because `stamp` / `new-phase` / `new-task` do not exist in
  the current CLI.

### Canonical and installed prompts are byte-identical

```
$ sha256sum packages/specs/prompts/spec-create.json .agents/@montflow/prompts/spec-create.json \
    packages/specs/prompts/spec-execute.json .agents/@montflow/prompts/spec-execute.json
1cf881f4ad541f8de39da62fb0b919bf508e1ecbfff2ca61ba20764f9787c209  packages/specs/prompts/spec-create.json
1cf881f4ad541f8de39da62fb0b919bf508e1ecbfff2ca61ba20764f9787c209  .agents/@montflow/prompts/spec-create.json
e819a8022885908a520e6733b35276459ce3cac9b763aa35e69aa7efa2504142  packages/specs/prompts/spec-execute.json
e819a8022885908a520e6733b35276459ce3cac9b763aa35e69aa7efa2504142  .agents/@montflow/prompts/spec-execute.json
```

Doctor run that produced the installed copies (never hand-edited):

```
$ bun run --cwd packages/specs cli doctor --dir "$PWD"
+ spec skills and prompts installed or repaired.
✓ montflow-create-specs: already installed → .../.agents/skills/montflow-create-specs
✓ montflow-find-specs: already installed → .../.agents/skills/montflow-find-specs
+ spec-create: repaired ('spec-create.json' differed from the package) → .../.agents/@montflow/prompts/spec-create.json
✓ spec-execute: already installed → .../.agents/@montflow/prompts/spec-execute.json
```

A final `doctor --check` reports both `up to date` (quoted under Gates).

### TASK completion gates (verbatim)

Grep and directory proof:

```
$ grep -rn "buildAuthorPrompt\|buildResumePrompt\|AUTHORING_SPEC\|EXECUTING_SPEC" packages apps
(no output; exit 1)

$ test ! -e packages/specs/src/skills && echo "packages/specs/src/skills does not exist"
packages/specs/src/skills does not exist
```

Loader/render tests (in `src/modules/prompt/tests/prompt.test.ts`):

- renders `spec-create` with the request and only `montflow-create-specs`
- renders optional `notes` only when supplied
- renders `spec-execute` with `name`, `state`, `next`, budget 2, the guided
  branch, and the three declared skills
- renders the autonomous branch only for a non-empty `unsupervised`
- budget 1 names the budget and says "a fourth round is refused"; budget 3 names
  the hard cap of 3
- missing prompt fails `prompt.missing` with the installed path, `not installed`,
  and `DOCTOR_FIX` (`Run mf-specs doctor …`), writing nothing
- stale prompt fails `prompt.stale` and keeps the doctor fix
- unknown prompt fails `prompt.unknown`
- a missing required variable fails `prompt.missing-variable` on `request`

### Final gates (verbatim, run after the last edit)

```
$ bun run mf:check:specs
6 specs · 0 failed · 0 issues · 79 warnings
✓ spec-create: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-create.json
✓ spec-execute: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-execute.json
exit=0
```

```
$ bun run mf:check:prompts
4 prompts · 0 issues · 0 warnings
✓ prompts skills are installed and up to date.
✓ montflow-create-prompts: up to date → .../.agents/skills/montflow-create-prompts
✓ montflow-execute-prompts: up to date → .../.agents/skills/montflow-execute-prompts
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

The 79 warnings are the pre-existing `size: Completed task declares no size`
advisories on historical specs; there is no error and no failed spec.

```
$ bun run --cwd packages/specs test
 Test Files  72 passed (72)
      Tests  748 passed (748)
Type Errors  no errors
exit=0
```

```
$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
exit=0
```

(The only output beyond the script echo is Node's `MODULE_TYPELESS_PACKAGE_JSON`
notice for the root/tooling config; it is not a finding.)

```
$ bun run --cwd packages/specs format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 330ms on 139 files using 16 threads.
exit=0
```

```
$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
exit=0
```

### Embedded payload

`bun run --cwd packages/specs generate:payload` was run after the final prompt
edit, so `embedded-payload.generated.ts` carries the new prompt bytes and the
`embedded payload` tests pass (`%s.json: the embed matches the packed prompt`).

## Open Questions

1. **C003 must wire `PromptError` into the CLI renderer.** `load` returns the
   coded error, but this task added no CLI command and did not touch
   `diagnoseCause`. C003 should add a `Match.instanceOf(Prompt.PromptError)` arm
   that maps `code` / `path` / `field` / `problem` / `expected` / `actual` /
   `fix` / `cause` onto `SizingDiagnostic`, and pass the **workspace root** (the
   `--dir` side, not `storeDirOf`'s specs root) to `load`.
2. **C005 owns the full docs and skill pass.** `packages/specs/skills/
   montflow-create-specs/SKILL.md` still names the deleted
   `packages/specs/src/skills/authoring-spec.ts` as its "Contract source"; the
   installed skill and the embedded payload carry the same line. C005 rewrites
   that section anyway.
3. **C002 owns the mode contract.** The rewritten execute prompt already uses
   `unsupervised` so the template verifies and the variable has a branch, with
   a guided default and an autonomous ask-exception list. C002 should record the
   naming decision, refine the prose, and add its branch assertions.
4. **Requirement wording vs. prompt order.** TASK lists the execute variables
   `name, state, next, reviewBudget, phase, focus, unsupervised`; the template
   uses exactly that first-appearance order. `mf:check:prompts` passes.
5. **No `src/modules/index.ts` edit.** `Prompt` was already exported; removing
   `SpecSkill` from the package root was the only index change needed.

## Handoff

- **C002**: `spec-execute.json` is live and installed; the mode hook is
  `{{#if unsupervised}} … {{else}} … {{/if}}` in section 8. Keep the variable
  name and first-appearance position. Render via `Prompt.load` or
  `mf-prompts render` with `reviewBudget` supplied.
- **C003**: `Prompt.load(root, name, values)` is the one loader; it requires
  `PromptStore.PromptStore` and returns `{ name, text, skills, prompt }`. Pass
  `state` from `mf-specs state`, `next` from `mf-specs next`, and
  `reviewBudget` from `Sizing.phaseReviewBudget`. Do not copy the rendering
  logic or read the prompt store directly. Add the `PromptError` diagnostic arm.
- **C005**: the canonical files are `packages/specs/prompts/spec-create.json`
  and `spec-execute.json`; the workspace copies are doctor-owned. The README
  still needs the author/execute/which docs pass; only the `Prompt` and
  `SpecSkill` bullets were touched here.
- **Reviewers**: judge (a) both prompts declare exactly the required variables
  and skills, (b) the execute prompt refuses a round past the budget including
  the fourth at cap 3 and names the tiny-only case, (c) the loader refuses
  missing/stale prompts with the doctor fix and no template text in TypeScript,
  (d) `src/skills` is gone with no dead export, (e) canonical and installed
  copies are byte-identical.

## Deviations

- **`modules/prompt` imports `apps/doctor`.** Doctor owns prompt freshness, so
  the gate calls `runDoctor(root, { check: true })` instead of duplicating the
  package-vs-installed comparison. No other module imports an app today; the
  alternative was a second drift rule, which SPEC forbids.
- **`packages/specs/README.md` was touched minimally.** The TASK completion grep
  over `packages apps` cannot pass while the README still names
  `AUTHORING_SPEC` / `EXECUTING_SPEC` / `buildAuthorPrompt` / `SpecSkill`. Only
  the `Prompt` bullet was rewritten and the `SpecSkill` bullet removed; C005 owns
  the full docs pass.
- **`embedded-payload.generated.ts` was regenerated**, not hand-edited. It is a
  generated file and its guard test would otherwise fail.
- **`format:fix` was run package-wide**, but `format:check` had flagged exactly
  two files (the new `spec-create.json` and `prompt.module.ts`), so no sibling
  in-flight file was reformatted.
- **No `BOARD.md` broadcast**: this phase has no `BOARD.md`, and this run may
  write only its own `MEMORY.md`.
- **No git commit**, per the worker contract.
