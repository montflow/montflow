# Memory

## Context

Task E004 (`docs-truth`) closes the two documentation lies the phase E audit
found, for spec `spec-optimizations`:

- `packages/specs/README.md`'s sizing transcript ran a bare `mf-specs models`,
  which fails `models.unavailable` outside the host, while the same section's
  step 3 and verification loop said to pass `--catalog <path>`.
- The README claimed `sizing --task` prints the task budget; only the detailed
  (`--verbose` / `--human`) output does.

`depends-on: E001, E003`; both are present in the working tree and untouched
here. E003's handoff added two more stale README sentences (`next`'s exit rule,
`models`' missing checked/skipped counts), which are in scope per its
`Open Questions` and the task's "every swept doc matches the binary" rule.

Scope: documentation truth only. No behaviour and no prompt text changed.

## Progress

- Verified every claim against the binary before editing, from the repo root:
  - `cli models` (bare) → `models.unavailable`, exit 1.
  - `cli models --catalog fixtures/catalog.json` → table, exit 0.
  - `cli sizing --dir fixtures --name mock-ok --task A001` → one compact line,
    no budget.
  - `cli sizing … --task A001 --human` → `budget 1 · contributes 1 · phase A
    budget 2` plus the provenance matrix.
  - `cli next --dir fixtures --name mock-bad` → every tree error, exit 1.
  - `cli models --verify --provider alpha --catalog fixtures/catalog.json --dir
    fixtures` → `0 entries checked · 2 skipped · repo 0 checked, 2 skipped ·
    provider alpha`, exit 0.
  - A scratch ship-login spec under `/tmp/opencode/e004` reproduced the
    transcript exactly: `3 entries checked · 0 skipped · repo 0 checked, 0
    skipped · spec 3 checked, 0 skipped · provider all`.
- `packages/specs/README.md`:
  - `next` bullet and the Diagnostics paragraph now say "every error `check`
    reports — config, task size, or tree".
  - `models` bullet now states every `--verify` run ends with one count line
    (checked/skipped, split by layer and provider).
  - Review-budget paragraph replaced with the compact-versus-detailed
    distinction: compact prints id/size/target/winning layer; `--verbose` /
    `--human` adds the task budget, its contribution, and the phase budget.
  - Sizing step 7 now says `--catalog <path>` outside the host.
  - "A model id is valid only if `mf-specs models` prints it" now names the
    host-free forms (`spec_models`, `mf-specs models --catalog <path>`).
  - Transcript: catalogue read is `mf-specs models --catalog <path>` with the
    real renderer spacing, and the verify step is `models --verify --name
    ship-login --catalog <path>` followed by the count line the binary prints.
- `packages/specs/src/apps/cli/CONTEXT.md`: `status` and `next` bullets now say
  they exit on every error `check` reports; the `models` bullet gains the count
  line.
- `AGENTS.md`: the catalogue read names `spec_models` / `mf-specs models
  --catalog <path>` instead of a bare `mf-specs models`.
- `packages/specs/skills/montflow-create-specs/` (canonical) and
  `.agents/skills/montflow-create-specs/` (doctor mirror, byte-identical):
  - sizing inspection text separates the compact line from `--human`.
  - the catalogue rule and the proof loop name the host-free reads.
  - the Reference sizing/catalogue bullets state compact versus detailed and the
    checked/skipped counts.
  - version `2.9.0` → `2.9.1` with a matching newest CHANGELOG entry.
- `packages/specs/src/modules/prompt/CONTEXT.md`: swept, nothing to change — it
  documents prompt loading, modes, and skill resolution only.
- `bun run --cwd packages/specs generate:payload` refreshed the embedded doctor
  payload after the skill edit; `mf-specs doctor --dir ../..` repaired the
  mirror.

## Findings

- The README transcript's own step 3 already warned that a bare `mf-specs
  models` fails outside the host; only the transcript and step 7 disagreed. All
  three now use `--catalog <path>` (or `spec_models` inside the host).
- The binary's catalogue table uses a fixed two-space column gap, not the padded
  alignment the old transcript showed; the transcript now matches the renderer
  byte for byte for the three placeholder rows.
- `models --verify` prints the count line even when it prints `✓ no model or
  effort findings`; with a provider filter that matches nothing it prints no
  `✓` at all, only `0 entries checked …`. The transcript and both doc bullets
  state the count line as unconditional, which is what the binary does.
- The compact `sizing` line is exactly `A001  tiny  fixture/phase-model#high
  phase` — no budget field exists to print; the budget belongs to the detailed
  report only.
- `next` on `fixtures/mock-bad` now exits 1 and prints ten tree blockers
  (`unspecified` codes), none of them config or task-size findings. The old
  README wording ("same config or task-size errors") was narrower than the
  binary on a non-sizing tree error.
- Doctor repair of the skill mirror is safe and scoped: it rewrote only
  `montflow-create-specs`, left `montflow-find-specs` and the three prompts
  untouched, and left `.agents/@montflow/prompts/` byte-identical.

## Open Questions

- `packages/specs/fixtures/README.md` still says the fixtures exist "for
  exercising the CLI and the Pi extension". That is a live legacy name, not a
  historical record; B004's naming sweep did not catch it. Out of E004's
  declared sweep list, so left untouched — worth a defect or an F-phase nail.
- `.agents/@montflow/profiles/spec-creation-orchestrator/PROFILE.md:102` and
  `.agents/@montflow/profiles/spec-execution-orchestrator/PROFILE.md:115` still
  describe the step as "inventories the live catalogue with `mf-specs models`" /
  "inventories `mf-specs models`", the exact bare form this task proved fails
  outside the host. Profiles are outside E004's sweep list; the sizing
  orchestrator profile already says `--catalog <path>`. Route to E099 or a
  follow-up rather than widening this diff.

## Handoff

- E099 review: attack (a) every catalogue command in the README sizing section —
  step 3, the transcript, step 7, and the "valid id" paragraph must each be
  runnable outside the host; (b) the budget claim — compact `sizing` must not be
  described as printing a budget anywhere in the swept set; (c) the `next` /
  `models --verify` sentences against a non-sizing tree error and a zero-entry
  provider filter; (d) skill mirror fidelity, including the regenerated embedded
  payload and the version/changelog pair.
- Reviewers should re-run `mf-specs doctor --check --dir ../..` from
  `packages/specs` to confirm the mirror still matches after any further skill
  edit, then `bun run --cwd packages/specs generate:payload`.
- No spec state, locks, ledgers, or other task directories were touched.

## Deviations

- Added a `2.9.1` skill version bump plus CHANGELOG entry. Editing `SKILL.md`
  without either would leave the frontmatter version pointing at older content
  and breaks the skill's own "bump version, update CHANGELOG" rule; the entry is
  documentation of the doc fix, not a behaviour claim.
- Regenerated `packages/specs/src/apps/doctor/embedded-payload.generated.ts` via
  `bun run --cwd packages/specs generate:payload`, because the embedded skill
  bytes must match the package (`embedded-payload.test.ts` enforces it). This is
  a generated artifact, not hand-edited code.
- Updated `packages/specs/README.md`'s `next` bullet and `models` bullet plus the
  `cli/CONTEXT.md` `status`/`next`/`models` bullets beyond the two named claims.
  E003's handoff explicitly asked for the first two; the CONTEXT bullets document
  the same contract and would otherwise contradict the README.
- Left `.agents/@montflow/prompts/` untouched; prompt text is out of scope and
  doctor reported all three prompts up to date before and after.

## Gate Evidence

### `bun run --cwd packages/specs test`

```text
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.4 /home/daniel/dev/montflow/spec-optimizations/packages/specs


 Test Files  90 passed (90)
      Tests  1106 passed (1106)
Type Errors  no errors
   Start at  17:00:46
   Duration  3.38s (import 80%, tests 13%, transform 5%, typecheck 1%, worker 1%)

    Isolate  46 workers spawned · ~137ms startup each (spawn + environment, per file)
             at least ~282ms faster with isolate: false — reuses workers across files instead of one per file

EXIT=0
```

### `bun run --cwd packages/specs lint:check`

```text
$ oxlint --deny-warnings .
(node:1106369) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/spec-optimizations/oxlint.config.ts?cache=1793221250067 is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:1106369) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/spec-optimizations/tooling/oxlint/anti-slop/effect/index.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/tooling/oxlint/package.json.
EXIT=0
```

### `bun run --cwd packages/specs format:check`

```text
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 430ms on 155 files using 16 threads.
EXIT=0
```

### `bun run --cwd packages/specs ts:check`

```text
$ tsc --noEmit
EXIT=0
```

### `bun run mf:check`

770 lines of output, exit 0. The 91 `task.missing-size` warnings are the
pre-existing historical backlog (F001's subject) and are identical before and
after this task; the verdict lines below are verbatim, in order.

```text
$ bun run mf:check
$ bun run mf:check:skills && bun run mf:check:prompts && bun run mf:check:specs && bun run mf:check:profiles && bun run mf:check:reviews
46 skills · 0 issues
✓ skills are installed and up to date.
✓ montflow-create-skills: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-create-skills
✓ montflow-modify-skills: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-modify-skills
5 prompts · 0 issues · 0 warnings
✓ prompts skills are installed and up to date.
✓ montflow-create-prompts: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-create-prompts
✓ montflow-execute-prompts: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-execute-prompts
✓ installation-guide (12 warnings)
✓ montflow-ci-verification (16 warnings)
✓ montflow-multi-reviewer (14 warnings)
✓ montflow-opencode-migration (24 warnings)
✓ montflow-project-structure (20 warnings)
✓ montflow-spec-standard (5 warnings)
8 specs · 0 failed · 0 issues · 91 warnings
✓ spec skills and prompts are installed and up to date.
✓ montflow-create-specs: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-create-specs
✓ montflow-find-specs: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-find-specs
✓ spec-create: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-create.json
✓ spec-execute: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-execute.json
✓ spec-sizing: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-sizing.json
12 profiles · 0 issues · 0 warnings
10 files · 0 issues
✓ review skills are installed and up to date.
✓ montflow-adversarial-review: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-adversarial-review
✓ montflow-addressing-adversarial-review: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-addressing-adversarial-review
EXIT=0
```

### Stage 1: catalogue commands work outside a host

```text
$ bun run --cwd packages/specs cli models
code     models.unavailable
path     models
field    catalog
problem  No host model catalogue is available.
expected --catalog <path>, or the host model port
actual   no catalogue source
fix      Pass --catalog <path> with the output of `mf-specs models --json` from a host, or run /specs models.
next     mf-specs models --catalog <path>
error: script "cli" exited with code 1
EXIT=1

$ bun run --cwd packages/specs cli models --catalog /tmp/opencode/e004/catalog.json
provider/cheap-model  variants none
provider/deep-model  variants high,max
provider/standard-model  variants high,low,max  *
EXIT=0

$ bun run --cwd packages/specs cli models --verify --name ship-login --catalog /tmp/opencode/e004/catalog.json --dir /tmp/opencode/e004
✓ no model or effort findings

3 entries checked · 0 skipped · repo 0 checked, 0 skipped · spec 3 checked, 0 skipped · provider all
EXIT=0
```

The three table rows and the count line are what the README transcript now
shows.

### Stage 1: compact versus `--human` sizing

```text
$ bun run --cwd packages/specs cli sizing --dir fixtures --name mock-ok --task A001
A001  tiny  fixture/phase-model#high  phase
EXIT=0

$ bun run --cwd packages/specs cli sizing --dir fixtures --name mock-ok --task A001 --human
A001 · declared tiny · target fixture/phase-model#high · source phase
budget 1 · contributes 1 · phase A budget 2

size    repo                    spec                       phase                     winner
tiny    fixture/repo-model#low  fixture/spec-model#medium  fixture/phase-model#high  phase
small   fixture/repo-model#low  fixture/spec-model         -                         spec
medium  -                       -                          -                         inherit
large   -                       -                          -                         inherit
EXIT=0
```

### Stage 1: `next` and `models --verify` claims

```text
$ bun run --cwd packages/specs cli models --verify --provider alpha --catalog fixtures/catalog.json --dir fixtures
0 entries checked · 2 skipped · repo 0 checked, 2 skipped · provider alpha
EXIT=0

$ bun run --cwd packages/specs cli next --dir fixtures --name mock-bad
…
code     unspecified
path     mock-bad
field    phase A
problem  Phase has no `review` task.
next     mf-specs check --name mock-bad
error: script "cli" exited with code 1
EXIT=1
```

### Stage 1: sweep greps

```text
$ grep -n "budget" <swept files> | grep -Ei "sizing|task's"
packages/specs/README.md:266:budget. Compact `sizing --task` omits it: the default line carries only the task
packages/specs/README.md:268:prints the task's budget, how much it contributes, and the phase budget.
packages/specs/src/apps/cli/CONTEXT.md:23:  phase review budget in the header and each task's size, target, and winning
packages/specs/src/apps/cli/CONTEXT.md:59:  review budget through `modules/sizing`, renders `spec-execute`, and prints it.
packages/specs/skills/montflow-create-specs/SKILL.md:230:… compact by default (id, size, target, source); `--verbose` / `--human` add the task and phase budgets …
.agents/skills/montflow-create-specs/SKILL.md:230:… (identical line) …

$ grep -n "task-size" <swept files>
packages/specs/README.md:467:  `layer`, and the `phase` for a nested override or a task-size finding). Exit

$ diff -r packages/specs/skills/montflow-create-specs .agents/skills/montflow-create-specs
(no output: byte-identical)
```

Every remaining budget sentence attributes it to `status` / `next` or to the
detailed sizing report; no swept file claims compact `sizing` prints a budget.

## Orchestrator gate re-run (2026-10-28, independent of the worker)

Stage 0, all four, exit 0:

```text
$ bun run --cwd packages/specs test
 Test Files  90 passed (90)
      Tests  1106 passed (1106)
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

Stage 1 line 3:

```text
$ bun run mf:check
3 skills · 0 issues
5 prompts · 0 issues · 0 warnings
8 specs · 0 failed · 0 issues · 91 warnings
12 profiles · 0 issues · 0 warnings
10 files · 0 issues
✓ spec skills and prompts are installed and up to date.
EXIT=0
```

Stage 1 line 1 — README transcript names a host-free catalogue command:

```text
$ grep -n "mf-specs models" packages/specs/README.md
350:3. **Inventory the catalogue.** It reads `mf-specs models --catalog <path>`
414:$ mf-specs models --catalog <path>
426:$ mf-specs models --verify --name ship-login --catalog <path>
```

Stage 1 line 2 — no swept file claims compact `sizing` prints the budget:

```text
$ grep -rn "sizing --task" packages/specs/README.md packages/specs/src/apps/cli/CONTEXT.md \
    packages/specs/src/modules/prompt/CONTEXT.md AGENTS.md packages/specs/skills/montflow-create-specs/SKILL.md
packages/specs/README.md:266:budget. Compact `sizing --task` omits it: the default line carries only the task
packages/specs/README.md:364:   `sizing --task <id> --human` for one task per explicit target. A failing
```

Both remaining hits state the compact-vs-`--human` distinction, which is the
correct behaviour. E004 completes.

## Orchestrator decision on parked questions

- `spec-creation-orchestrator/PROFILE.md:102` and
  `spec-execution-orchestrator/PROFILE.md:115` still say bare `mf-specs models`.
  Both files are outside E004's declared sweep list, so this is not rework for
  E004. Surfaced to the E099 review as an in-scope question for phase E, whose
  description covers "the README truth pass" and whose requirement 156 covers
  host-free catalogue reads.
- `packages/specs/fixtures/README.md` still names "the Pi extension". Historical
  phase B retired live `pi` naming; a fixture README is a live artifact, but it
  is outside E004's sweep. Surfaced to the E099 review, not fixed here.
