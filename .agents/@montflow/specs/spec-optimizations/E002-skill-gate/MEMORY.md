# Memory

## Context

Task E002 closes the packaging gap where a fresh workspace with only
`mf-specs doctor` applied rendered `spec-create` but failed `spec-execute` and
`spec-sizing` with `prompt.skill-missing`. Doctor ships two skills
(`montflow-create-specs`, `montflow-find-specs`) and three prompts, while the
execution prompt also declares two review skills and the sizing prompt declares
`executing-skills`, `grilling`, and `i-have-adhd`.

Scope: `packages/specs` plus the docs/profile/skill copies the task names. No
`SPEC.md`, `TASK.md`, status, lock, or ledger was edited.

## Progress

- Read `TASK.md`, `GATES.md`, `SPEC.md`, the prompt loader, doctor module, CLI
  command surface, server tools, README, authoring skill, and the sizing profile.
- Chose fix (b): doctor-owned skills stay required; declared non-owned skills
  become advisory.
- Implemented the advisory path in `modules/prompt`:
  - new stable code `prompt.skill-advisory`;
  - `LoadedPrompt.advisories` carries one agent-first `PromptError` per missing
    non-owned declared skill;
  - the rendered text gains a labelled `## Skill advisories` block naming every
    missing skill, its path, and its install command;
  - `LoadedPrompt.skills` now contains only installed declared skills, while
    `LoadedPrompt.prompt.skills` keeps the full declaration;
  - doctor-owned missing/stale/blocked skills still fail with
    `prompt.skill-missing` / `-stale` / `-blocked` and their existing fixes.
- Added `modules/prompt/tests/skill-gate.test.ts` covering the fresh
  doctor-only render for all three prompts, the advisory path and its
  disappearance once installed, and owned missing/stale failures.
- Added a CLI-level fresh doctor-only test in
  `apps/cli/tests/author-execute.test.ts` and updated the old "refuses a foreign
  skill" case to assert the advisory render.
- Updated `apps/doctor/tests/doctor.test.ts` to use a unique hand-edit marker:
  the shipped authoring skill now legitimately contains the word `stale`.
- Regenerated `apps/doctor/embedded-payload.generated.ts`.
- Updated README, prompt CONTEXT, doctor CONTEXT, the authoring skill (package
  and workspace copies byte-identical, version 2.9.0 + changelog), and the
  `spec-sizing-orchestrator` profile.
- Ran every Stage 0 gate and both behavior checks below.

## Findings

### Chosen fix: (b) — doctor-owned required, non-owned advisory

Rationale:

- Option (a) would make `packages/specs` vendor five skills it does not own
  (`montflow-adversarial-review`, `montflow-addressing-adversarial-review`,
  `executing-skills`, `grilling`, `i-have-adhd`), duplicate their bodies into
  `packages/specs/skills/` and the embedded payload, and create a second source
  of truth for every one of them. It also widens doctor's ownership boundary
  past the two spec skills the package actually ships.
- Option (b) keeps doctor's ownership honest while making a clean install usable:
  the prompt renders, the rendered text and `LoadedPrompt.advisories` name every
  missing external skill, and the executor receives only installed skills.
- Requirement 154 explicitly allows either an installed non-doctor skill or an
  explicitly advisory one, and requirement 102 fixes doctor's ownership to the
  three prompts and its two skills.

Behavioral facts pinned by tests:

- Fresh `runDoctor` only: `spec-create` skills =
  `['montflow-create-specs']`, no advisories; `spec-execute` skills =
  `['montflow-find-specs']`, advisories = the two review skills; `spec-sizing`
  skills = `['montflow-find-specs', 'montflow-create-specs']`, advisories =
  `['executing-skills', 'grilling', 'i-have-adhd']`.
- Installing `grilling` moves it from advisories into `skills` and removes its
  advisory text.
- Removing a doctor-owned skill still fails with the old code and fix, even when
  other non-owned advisories exist.

## Gate evidence

Stage 0, run from the repo root after the final code edit. Commands and output
are quoted from the final runs.

### `bun run --cwd packages/specs test`

```text
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when it does.

 RUN  v5.0.4 /home/daniel/dev/montflow/spec-optimizations/packages/specs


 Test Files  90 passed (90)
      Tests  1092 passed (1092)
Type Errors  no errors
   Start at  16:42:16
   Duration  2.86s (import 80%, tests 14%, transform 5%, typecheck 1%, worker 1%)
exit=0
```

### `bun run --cwd packages/specs lint:check`

```text
$ oxlint --deny-warnings .
(node:955297) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/spec-optimizations/oxlint.config.ts?cache=1793220060596 is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:955297) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/spec-optimizations/tooling/oxlint/anti-slop/effect/index.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/tooling/oxlint/package.json.
exit=0
```

### `bun run --cwd packages/specs format:check`

```text
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 495ms on 155 files using 16 threads.
exit=0
```

### `bun run --cwd packages/specs ts:check`

```text
$ tsc --noEmit
exit=0
```

### Prompt-sync verifies

`bun run mf:check:specs`, `bun run mf:check:skills`, and
`bun run mf:check:profiles` all exited `0`. Final lines:

```text
$ bun run src/apps/cli/main.ts doctor --check --dir /home/daniel/dev/montflow/spec-optimizations
✓ spec skills and prompts are installed and up to date.
✓ montflow-create-specs: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-create-specs
✓ montflow-find-specs: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-find-specs
✓ spec-create: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-create.json
✓ spec-execute: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-execute.json
✓ spec-sizing: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-sizing.json
exit=0
```

```text
$ bun run src/apps/cli/main.ts verify --dir /home/daniel/dev/montflow/spec-optimizations
46 skills · 0 issues
$ bun run src/apps/cli/main.ts doctor --check --dir /home/daniel/dev/montflow/spec-optimizations
✓ skills are installed and up to date.
exit=0
```

```text
$ bun run --cwd packages/profiles cli verify --dir $PWD
12 profiles · 0 issues · 0 warnings
exit=0
```

### Stage 1: fresh doctor-only workspace renders all three prompts

Workspace: `/tmp/opencode/e002-fresh`, seeded from
`packages/specs/fixtures/.agents/` (spec tree only), then only:

```text
$ bun run --cwd packages/specs cli doctor --dir /tmp/opencode/e002-fresh
+ spec skills and prompts installed or repaired.
+ montflow-create-specs: installed → /tmp/opencode/e002-fresh/.agents/skills/montflow-create-specs
+ montflow-find-specs: installed → /tmp/opencode/e002-fresh/.agents/skills/montflow-find-specs
+ spec-create: installed → /tmp/opencode/e002-fresh/.agents/@montflow/prompts/spec-create.json
+ spec-execute: installed → /tmp/opencode/e002-fresh/.agents/@montflow/prompts/spec-execute.json
+ spec-sizing: installed → /tmp/opencode/e002-fresh/.agents/@montflow/prompts/spec-sizing.json
```

```text
$ bun run --cwd packages/specs cli author --dir /tmp/opencode/e002-fresh --request "Ship login"
You are the spec author. Follow the `montflow-create-specs` skill and this pipeline.
...
exit=0
```

```text
$ bun run --cwd packages/specs cli execute --dir /tmp/opencode/e002-fresh --name mock-ok
You are the spec execution orchestrator. Follow the `spec-execution-orchestrator` profile.
...
## Skill advisories

These declared skills are not installed in this workspace. The prompt renders without them; install each before relying on its guidance.

code     prompt.skill-advisory
path     /tmp/opencode/e002-fresh/.agents/skills/montflow-adversarial-review
field    montflow-adversarial-review
problem  Skill 'montflow-adversarial-review' declared by prompt 'spec-execute' is not installed; the prompt renders without it.
expected an installed skill named 'montflow-adversarial-review' under /tmp/opencode/e002-fresh/.agents/skills/
actual   not installed
fix      Install 'montflow-adversarial-review' under /tmp/opencode/e002-fresh/.agents/skills/ (npx skills add montflow/montflow -s montflow-adversarial-review -y), then re-run.

code     prompt.skill-advisory
path     /tmp/opencode/e002-fresh/.agents/skills/montflow-addressing-adversarial-review
field    montflow-addressing-adversarial-review
problem  Skill 'montflow-addressing-adversarial-review' declared by prompt 'spec-execute' is not installed; the prompt renders without it.
expected an installed skill named 'montflow-addressing-adversarial-review' under /tmp/opencode/e002-fresh/.agents/skills/
actual   not installed
fix      Install 'montflow-addressing-adversarial-review' under /tmp/opencode/e002-fresh/.agents/skills/ (npx skills add montflow/montflow -s montflow-addressing-adversarial-review -y), then re-run.
exit=0
```

`execute` output abridged only in the middle of the prompt body; the appended
advisory block is verbatim.

```text
$ bun run --cwd packages/specs cli sizing-config --dir /tmp/opencode/e002-fresh --scope repo
You are the spec sizing orchestrator. Follow the `spec-sizing-orchestrator` profile.
...
## Skill advisories

These declared skills are not installed in this workspace. The prompt renders without them; install each before relying on its guidance.

code     prompt.skill-advisory
path     /tmp/opencode/e002-fresh/.agents/skills/executing-skills
field    executing-skills
problem  Skill 'executing-skills' declared by prompt 'spec-sizing' is not installed; the prompt renders without it.
expected an installed skill named 'executing-skills' under /tmp/opencode/e002-fresh/.agents/skills/
actual   not installed
fix      Install 'executing-skills' under /tmp/opencode/e002-fresh/.agents/skills/ (npx skills add montflow/montflow -s executing-skills -y), then re-run.

code     prompt.skill-advisory
path     /tmp/opencode/e002-fresh/.agents/skills/grilling
field    grilling
problem  Skill 'grilling' declared by prompt 'spec-sizing' is not installed; the prompt renders without it.
expected an installed skill named 'grilling' under /tmp/opencode/e002-fresh/.agents/skills/
actual   not installed
fix      Install 'grilling' under /tmp/opencode/e002-fresh/.agents/skills/ (npx skills add montflow/montflow -s grilling -y), then re-run.

code     prompt.skill-advisory
path     /tmp/opencode/e002-fresh/.agents/skills/i-have-adhd
field    i-have-adhd
problem  Skill 'i-have-adhd' declared by prompt 'spec-sizing' is not installed; the prompt renders without it.
expected an installed skill named 'i-have-adhd' under /tmp/opencode/e002-fresh/.agents/skills/
actual   not installed
fix      Install 'i-have-adhd' under /tmp/opencode/e002-fresh/.agents/skills/ (npx skills add montflow/montflow -s i-have-adhd -y), then re-run.
exit=0
```

### Stage 1: removing a doctor-owned skill still fails

After deleting `/tmp/opencode/e002-fresh/.agents/skills/montflow-find-specs`:

```text
$ bun run --cwd packages/specs cli execute --dir /tmp/opencode/e002-fresh --name mock-ok
code     prompt.skill-missing
path     /tmp/opencode/e002-fresh/.agents/skills/montflow-find-specs
field    montflow-find-specs
problem  Skill 'montflow-find-specs' declared by prompt 'spec-execute' is not installed.
expected a current 'montflow-find-specs' skill at '/tmp/opencode/e002-fresh/.agents/skills/montflow-find-specs'
actual   not installed at '/tmp/opencode/e002-fresh/.agents/skills/montflow-find-specs'
fix      Run mf-specs doctor to install or refresh the shipped skills and prompts.
next     mf-specs execute
error: script "cli" exited with code 1
exit=1
```

### Stage 1: README and authoring skill

Both name the prerequisite skills and the chosen behavior:

- `packages/specs/README.md` has the `Prerequisite skills and advisories`
  section, the required/advisory split per prompt, the two-tier behavior, and the
  installer command.
- `packages/specs/skills/montflow-create-specs/SKILL.md` (and its byte-identical
  `.agents/skills/montflow-create-specs/SKILL.md` mirror) names the same list and
  behavior; changelog entry `2.9.0`.
- `modules/prompt/CONTEXT.md`, `apps/doctor/CONTEXT.md`, and
  `spec-sizing-orchestrator/PROFILE.md` state the same rule.

## Open Questions

- None. The chosen behavior is fully specified by the task; no user decision is
  outstanding.

## Handoff

- E003/E004 inherit `prompt.skill-advisory` and `LoadedPrompt.advisories` if they
  need to report skill prerequisites in status or docs.
- The prompt loader is still the place that turns doctor results into coded
  errors; task G005 later moves the doctor dependency out of `src/modules`.
- `packages/specs/src/apps/doctor/embedded-payload.generated.ts` must be
  regenerated (`bun run --cwd packages/specs generate:payload`) whenever a
  packaged skill or prompt changes; `embedded-payload.test.ts` enforces it.

## Deviations

- Chose fix (b), not (a); rationale above.
- `apps/doctor/tests/doctor.test.ts` now uses a `hand-edit-marker` string instead
  of the word `stale`, because the shipped authoring skill legitimately contains
  that word in its new prerequisite paragraph.
- `bun run --cwd packages/specs format:fix` has no path filter and formatted two
  files that are being edited by E001 (`apps/cli/cli.apps.module.ts`,
  `apps/cli/tests/validate-names.test.ts`). This was formatting-only; no
  semantic edits were made to those files.
- `packages/specs/src/apps/cli/tests/sizing-config.test.ts` and
  `packages/specs/src/modules/spec/spec.module.ts` show as modified in the
  worktree from E001, not this task.

## Orchestrator gate re-run (2026-10-28, independent of the worker)

Stage 0, all four, exit 0 (run once, shared with E001, against the post-E002
tree):

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

Stage 1, fresh root `/tmp/opencode/e002-orch` built by doctor alone:

```
$ bun run --cwd packages/specs cli doctor --dir /tmp/opencode/e002-orch
+ spec skills and prompts installed or repaired.
+ montflow-create-specs: installed → /tmp/opencode/e002-orch/.agents/skills/montflow-create-specs
+ montflow-find-specs: installed → /tmp/opencode/e002-orch/.agents/skills/montflow-find-specs
+ spec-create: installed → /tmp/opencode/e002-orch/.agents/@montflow/prompts/spec-create.json
+ spec-execute: installed → /tmp/opencode/e002-orch/.agents/@montflow/prompts/spec-execute.json
+ spec-sizing: installed → /tmp/opencode/e002-orch/.agents/@montflow/prompts/spec-sizing.json
DOCTOR_EXIT=0

$ bun run --cwd packages/specs cli author --request test --dir /tmp/opencode/e002-orch
You are the spec author. Follow the `montflow-create-specs` skill and this pipeline.
...
EXIT=0

$ bun run --cwd packages/specs cli execute --name mock-ok --dir /tmp/opencode/e002-orch
You are the spec execution orchestrator. Follow the `spec-execution-orchestrator` profile.
...
EXIT=0 (rendered; fixture spec `mock-ok`, no non-doctor prompt or skill copied)

$ bun run --cwd packages/specs cli sizing-config --scope repo --dir /tmp/opencode/e002-orch
You are the spec sizing orchestrator. Follow the `spec-sizing-orchestrator` profile.
...
EXIT=0
```

Doctor-owned skill removed (`montflow-find-specs`), then `execute`:

```
$ bun run --cwd packages/specs cli execute --name mock-ok --dir /tmp/opencode/e002-orch
code     prompt.skill-missing
path     /tmp/opencode/e002-orch/.agents/skills/montflow-find-specs
field    montflow-find-specs
problem  Skill 'montflow-find-specs' declared by prompt 'spec-execute' is not installed.
expected a current 'montflow-find-specs' skill at '/tmp/opencode/e002-orch/.agents/skills/montflow-find-specs'
actual   not installed at '/tmp/opencode/e002-orch/.agents/skills/montflow-find-specs'
fix      Run mf-specs doctor to install or refresh the shipped skills and prompts.
next     mf-specs execute
EXIT=1
```

Docs (Stage 1 line 3) verified by the orchestrator:

```
$ grep -n "Prerequisite skills and advisories" packages/specs/README.md
116:#### Prerequisite skills and advisories
$ grep -n "Prerequisite skill list" .agents/skills/montflow-create-specs/SKILL.md
23:**Prerequisite skill list.** `mf-specs doctor` installs the required
$ diff packages/specs/skills/montflow-create-specs/SKILL.md .agents/skills/montflow-create-specs/SKILL.md
IDENTICAL
```

All three Stage 1 gates pass. E002 completes.
