# Memory

## Context

C005 `docs-and-profiles`: teach the prompt-based flow where humans and agents
look for it. The README gains `author`, `execute`, and `which`; the authoring
and discovery skills point at prompt names and commands instead of inline
prompt text; the creation and execution profiles name `spec-create` /
`spec-execute`, the `guided` default, and the `autonomous` exception list.

Worktree `/home/daniel/dev/montflow/spec-optimizations`, branch
`feat/spec-optimizations`. Depends on C004; consumes the prompt loader (C001),
mode contract (C002), commands (C003), and resolver (C004).

In scope and touched: `packages/specs/README.md`, the two package skills and
their CHANGELOGs, the two orchestrator profiles, `AGENTS.md`, and two
`CONTEXT.md` files. Out of scope and untouched: code behavior, `SPEC.md`, task
statuses, locks, other task directories, historical spec records, old CHANGELOG
entries, and prompt JSON files (doctor owns those).

## Progress

Done.

Files modified:

- `packages/specs/README.md` — intro no longer claims skill text is "injected
  into dispatched sessions"; CLI bullets for `author`, `execute`, `which`; new
  "Authoring and execution prompts" and "Spec detection (`which`)" sections; an
  `execute --mode autonomous` example resolving from `feat/ship-login`; a
  "Review budget" table with the cap of 3 and the tiny-only case; `Prompt` and
  `Cli` library bullets name the loader, `PROMPT_NAMES`, modes, and the new
  engines.
- `packages/specs/skills/montflow-create-specs/SKILL.md` (2.6.0) — new
  "0. Choose a Front End" section points at the `spec-create` prompt,
  `mf-specs author`, `/specs author`, and the `spec_author` tool; reference now
  names `packages/specs/prompts/spec-create.json` and drops the deleted
  `src/skills/authoring-spec.ts`.
- `packages/specs/skills/montflow-create-specs/CHANGELOG.md` — 2.6.0 entry.
- `packages/specs/skills/montflow-find-specs/SKILL.md` (1.5.0) — new
  "5. Resolve the Spec the Branch Names" (grammar, exact-then-prefix, ask the
  user) and "6. Begin or Resume with `execute`" (`guided` / `autonomous`);
  "Do Not Guess" renumbered to 7; reference names the prompt and the
  `which` / `execute` engines.
- `packages/specs/skills/montflow-find-specs/CHANGELOG.md` — 1.5.0 entry.
- `.agents/@montflow/profiles/spec-creation-orchestrator/PROFILE.md` — step 4
  authors through `spec-create` (`mf-specs author`, `/specs author`,
  `spec_author`) and `montflow-create-specs`; new "Interaction mode" section
  with the `guided` default and the three autonomous ask-only cases.
- `.agents/@montflow/profiles/spec-execution-orchestrator/PROFILE.md` — new
  "Execution prompt and interaction mode" section: `spec-execute` via
  `mf-specs execute`, `/specs execute`, `spec_execute`, branch resolution
  through `which`, `guided` default, and the three autonomous ask-only cases.
- `AGENTS.md` — new "Spec prompts" section: package prompts are canonical,
  workspace copies are doctor-owned, sync/verify commands, render commands,
  branch resolution, and the mode contract.
- `packages/specs/src/modules/scaffold/CONTEXT.md` — no longer says authoring
  "dispatches a session (`prompt` module)"; it renders `spec-create` (or
  `mf-specs author`).
- `packages/specs/src/apps/doctor/CONTEXT.md` — names the shipped
  `spec-create` / `spec-execute` prompts instead of "prompts those skills
  render".

Generated / synced, not hand-edited:

- `.agents/skills/montflow-create-specs/{SKILL.md,CHANGELOG.md}` and
  `.agents/skills/montflow-find-specs/{SKILL.md,CHANGELOG.md}` — written by
  `mf-specs doctor` from the package files.
- `packages/specs/src/apps/doctor/embedded-payload.generated.ts` — regenerated
  with `bun run --cwd packages/specs generate:payload` (2 skills, 2 prompts).

## Findings

### What the docs now say

- The README states plainly that `author` / `execute` render and never
  dispatch; only `/specs author|execute` and `spec_author` / `spec_execute`
  reach an executor.
- Branch selection: `<prefix>/<feature-name>` with the eleven conventional
  prefixes, exact first then a unique prefix match, no fuzzy matching, and the
  ask-the-user rule on any miss or ambiguity. Worktree `.git`-file detection is
  documented.
- Modes: exactly `guided` (default) and `autonomous`; autonomous asks only for
  a destructive/irreversible action, a very dangerous tool call, or an
  undecidable decision, recording everything else in `MEMORY.md`. The mode is
  interaction-only.
- Review budget: `tiny` 1, `small` 2, `medium` 3, `large` 3; hard cap 3; a
  cycle is a reviewer round; a tiny-only phase gets one cycle.

### Legacy references are gone from live artifacts

```
$ grep -rn "buildAuthorPrompt\|buildResumePrompt\|AUTHORING_SPEC\|EXECUTING_SPEC\|SpecSkill" AGENTS.md README.md packages/specs/README.md packages/specs/skills packages/specs/src packages/specs/wiki .agents/@montflow/profiles .agents/skills
(no output; exit 1)
```

The only remaining `buildAuthorPrompt` / `AUTHORING_SPEC` hits in the repo are
inside completed spec records, which this task must not rewrite.

### Doctor sync (verbatim)

```
$ bun run --cwd packages/specs cli doctor --dir "$PWD"
$ bun run src/apps/cli/main.ts doctor --dir /home/daniel/dev/montflow/spec-optimizations
+ spec skills and prompts installed or repaired.
+ montflow-create-specs: repaired (rewrote CHANGELOG.md, SKILL.md ('CHANGELOG.md' differs from the package)) → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-create-specs
+ montflow-find-specs: repaired (rewrote CHANGELOG.md, SKILL.md ('CHANGELOG.md' differs from the package)) → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-find-specs
✓ spec-create: already installed → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-create.json
✓ spec-execute: already installed → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-execute.json
```

The prompt JSON files were never hand-edited; doctor reported both already
installed.

### Skill mirrors are byte-identical

```
$ sha256sum packages/specs/skills/montflow-create-specs/SKILL.md .agents/skills/montflow-create-specs/SKILL.md packages/specs/skills/montflow-create-specs/CHANGELOG.md .agents/skills/montflow-create-specs/CHANGELOG.md packages/specs/skills/montflow-find-specs/SKILL.md .agents/skills/montflow-find-specs/SKILL.md packages/specs/skills/montflow-find-specs/CHANGELOG.md .agents/skills/montflow-find-specs/CHANGELOG.md
b1dcacf1e36089addf73e394898df2249bf3d81ea2ba454c5b3529e23282ea79  packages/specs/skills/montflow-create-specs/SKILL.md
b1dcacf1e36089addf73e394898df2249bf3d81ea2ba454c5b3529e23282ea79  .agents/skills/montflow-create-specs/SKILL.md
8a709a7e1ddbd1b69fe5af301c8705222097de825e50635eaa45514e859c1a46  packages/specs/skills/montflow-create-specs/CHANGELOG.md
8a709a7e1ddbd1b69fe5af301c8705222097de825e50635eaa45514e859c1a46  .agents/skills/montflow-create-specs/CHANGELOG.md
b7dd987f8836f696ac9eb2dc96e36ae13cfef6b123e6ce5ec8156abf2f142ec0  packages/specs/skills/montflow-find-specs/SKILL.md
b7dd987f8836f696ac9eb2dc96e36ae13cfef6b123e6ce5ec8156abf2f142ec0  .agents/skills/montflow-find-specs/SKILL.md
31c2fb1d18b8a93c2224bea1a49cbb20ed98407baf1093730657a9022d2a081e  packages/specs/skills/montflow-find-specs/CHANGELOG.md
31c2fb1d18b8a93c2224bea1a49cbb20ed98407baf1093730657a9022d2a081e  .agents/skills/montflow-find-specs/CHANGELOG.md
```

### Live probes for the documented commands

```
$ bun run --cwd packages/specs cli which --dir "$PWD"
$ bun run src/apps/cli/main.ts which --dir /home/daniel/dev/montflow/spec-optimizations
spec-optimizations
```

```
$ bun run --cwd packages/specs cli execute --mode autonomous
$ bun run src/apps/cli/main.ts execute --mode autonomous
You are the spec execution orchestrator. Follow the `spec-execution-orchestrator` profile.

Drive exactly this spec toward completion, one phase at a time:
spec-optimizations
…
```

### Gates (verbatim)

```
$ bun run mf:check
…
46 skills · 0 issues
4 prompts · 0 issues · 0 warnings
6 specs · 0 failed · 0 issues · 79 warnings
11 profiles · 0 issues · 0 warnings
6 files · 0 issues
✓ spec skills and prompts are installed and up to date.
✓ montflow-create-specs: up to date → .../.agents/skills/montflow-create-specs
✓ montflow-find-specs: up to date → .../.agents/skills/montflow-find-specs
✓ spec-create: up to date → .../.agents/@montflow/prompts/spec-create.json
✓ spec-execute: up to date → .../.agents/@montflow/prompts/spec-execute.json
```

The 79 warnings are the pre-existing `task.missing-size` advisories on
historical specs; no error and no failed spec.

```
$ bun run mf:check:skills
46 skills · 0 issues
✓ skills are installed and up to date.
```

```
$ bun run mf:check:profiles
11 profiles · 0 issues · 0 warnings
exit=0
```

```
$ bun run mf:check:prompts
4 prompts · 0 issues · 0 warnings
✓ prompts skills are installed and up to date.
exit=0
```

```
$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
exit=0
```

(The only extra output is Node's `MODULE_TYPELESS_PACKAGE_JSON` notices for the
root/tooling configs; they are not findings.)

```
$ bun run --cwd packages/specs format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 316ms on 143 files using 16 threads.
exit=0
```

```
$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
exit=0
```

```
$ bun run --cwd packages/specs test
 Test Files  76 passed (76)
      Tests  824 passed (824)
Type Errors  no errors
exit=0
```

## Open Questions

1. **Creation profile still carries appraiser/tier prose from the spec-standard
   plan.** C005 was scoped to prompt names and modes, so `spec-appraiser`,
   `complexity tier`, `PHASE.md`, and the missing `new-phase` / `new-task` /
   `stamp` / `init` verbs remain in `spec-creation-orchestrator`. If the phase
   review wants the profile fully aligned with the current CLI, that is a
   separate docs task; it was not changed here to avoid scope creep.
2. **`author` has no `--mode` flag.** Only `execute` accepts `guided` /
   `autonomous` per SPEC. The creation profile therefore states the mode
   contract for the session, without inventing an `author --mode` option.

## Handoff

- **C099 / reviewers**: judge (a) every README requirement is present —
  `author`, `execute`, `which`, loader + templates, the mode example, branch
  grammar/matching/ask rule, and the review table with the cap; (b) both
  profiles state the guided default and the exact autonomous exception list;
  (c) the two skill copies are byte-identical and versions/CHANGELOGs agree;
  (d) no live artifact names `buildAuthorPrompt`, `AUTHORING_SPEC`,
  `EXECUTING_SPEC`, `SpecSkill`, or `src/skills/authoring-spec.ts`.
- **D004** inherits the same README pattern: add `sizing-config` and the third
  prompt to "Prompt sync", the CLI list, and `Prompt`'s `PROMPT_NAMES`.
- **D001–D003**: no docs were written for the model catalogue or sizing wizard;
  D004 owns that pass.

## Deviations

- **`AGENTS.md` gained a "Spec prompts" section rather than losing text.** The
  root file had no `buildAuthorPrompt` reference; the section documents the
  canonical/doctor-owned prompt split and the mode contract so the old injected
  setup has no live description left.
- **`embedded-payload.generated.ts` was regenerated**, not hand-edited, because
  the two packaged skills changed and the embed guard test compares bytes.
- **No `BOARD.md` broadcast**: this phase has no `BOARD.md`, and this run may
  write only its own `MEMORY.md`.
- **No git commit**, per the worker contract.
