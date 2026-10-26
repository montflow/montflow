# Memory

## Context

B002 `prompt-sync`: make `packages/specs/prompts/` the canonical source for
`spec-create.json` and `spec-execute.json`, and teach `mf-specs doctor` to
install or refresh the copies under `.agents/@montflow/prompts/`, exactly like
it already installs the spec skills.

Scope: `packages/specs/src/apps/doctor/**`,
`packages/specs/src/apps/cli/cli.apps.module.ts` (doctor wiring only),
`packages/specs/src/apps/cli/tests/**` (not needed),
`packages/specs/src/apps/doctor/CONTEXT.md`, `packages/specs/README.md`. The two
prompt JSON files, skills, profiles, and all spec records were out of scope;
A003 already created the two package prompt files, so this task adopted them
without editing or recreating them.

Worktree `/home/daniel/dev/montflow/spec-optimizations`, branch
`feat/spec-optimizations`.

## Progress

Done.

Files modified:

- `packages/specs/src/apps/doctor/doctor.apps.module.ts` —
  `SPEC_PROMPT_NAMES = ['spec-create', 'spec-execute']`; a shared
  `PayloadInstall` (`SkillInstall` / `PromptInstall` aliases) and
  `DoctorResult.prompts`; `installedPromptDir` / `installedPromptFile` /
  `shippedPromptFile`; `installPrompt` with check-mode `ok` / `missing` /
  `stale` and repair-mode write of the package bytes; `runDoctor` aggregates
  skills and prompts into one `ok` / `present` / `installed` / `drifted` status.
  Skill install path and behaviour unchanged.
- `packages/specs/src/apps/doctor/tests/doctor.test.ts` — six tests covering
  install + idempotence, nested repo-root resolution, check-mode drift with no
  writes, missing-prompt install with unrelated prompts byte-identical,
  stale-prompt repair with source/target paths, and a current prompt reported
  `ok`/`present` with unchanged `mtime`/`ctime`.
- `packages/specs/src/apps/doctor/CONTEXT.md` — prompt ownership, paths,
  byte-comparison/repair rule, unrelated-prompt rule.
- `packages/specs/README.md` — `doctor` CLI bullet, new `## Prompt sync` section
  (package file is canonical, installed copy is never hand-edited, doctor owns
  exactly two files, `Run: mf-specs doctor`), and `Doctor` library surface.
- `packages/specs/src/apps/cli/cli.apps.module.ts` — doctor wiring only:
  `renderDoctor` now prints one line per skill and prompt with target (and the
  package source when drifted) and the `Run: mf-specs doctor` fix line; the
  `doctor` command flag and description mention prompts.

Files adopted unchanged (created by A003):

- `packages/specs/prompts/spec-create.json`
- `packages/specs/prompts/spec-execute.json`

## Findings

### Canonical and installed prompts are byte-identical

```
$ sha256sum packages/specs/prompts/*.json .agents/@montflow/prompts/*.json
8a72e1d6aacb473e1b3ed7c210a1df47e43585fc189ec7e0dd1ea52dcfb6fc4d  packages/specs/prompts/spec-create.json
87072829f15853cbf1c62f25e2018123f3bee8c6e470488a40073498ef61ffad  packages/specs/prompts/spec-execute.json
a2845fb001581f06b1ad0c90826e2d4b2418e753e68e05bf0583c6d6d5850544  .agents/@montflow/prompts/commit.json
782cfb3eb311eb87be104a2caaddfa6af0fdbcf705899a52696172efe9d59aa3  .agents/@montflow/prompts/effect-review.json
8a72e1d6aacb473e1b3ed7c210a1df47e43585fc189ec7e0dd1ea52dcfb6fc4d  .agents/@montflow/prompts/spec-create.json
87072829f15853cbf1c62f25e2018123f3bee8c6e470488a40073498ef61ffad  .agents/@montflow/prompts/spec-execute.json
```

`commit.json` and `effect-review.json` hashes match B001's recorded values, so
this task did not touch them.

### Doctor check on this repo

```
$ bun run --cwd packages/specs cli doctor --check --dir "$PWD"
$ bun run src/apps/cli/main.ts doctor --check --dir /home/daniel/dev/montflow/spec-optimizations
✓ spec skills and prompts are installed and up to date.
✓ montflow-create-pi-specs: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-create-pi-specs
✓ montflow-find-pi-specs: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-find-pi-specs
✓ spec-create: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-create.json
✓ spec-execute: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-execute.json
exit=0
```

Repair mode on the same repo also exits 0 with the same four "up to date"
prompt/skill lines and the `✓ spec skills and prompts are installed.` head.

### Stale detection and repair, with unrelated prompts preserved

Demo root `/tmp/opencode/b002-demo` seeded with `.git/`, a stale
`spec-create.json`, no `spec-execute.json`, and two unrelated prompts.

Check mode, before any repair:

```
$ bun run --cwd packages/specs cli doctor --check --dir /tmp/opencode/b002-demo
✗ spec skills and prompts are not current.
✗ montflow-create-pi-specs: not installed at '/tmp/opencode/b002-demo/.agents/skills/montflow-create-pi-specs' → ... (from .../packages/specs/skills/montflow-create-pi-specs)
✗ montflow-find-pi-specs: not installed at ... (from .../packages/specs/skills/montflow-find-pi-specs)
✗ spec-create: 'spec-create.json' differs from the package → .../.agents/@montflow/prompts/spec-create.json (from .../packages/specs/prompts/spec-create.json)
✗ spec-execute: not installed at .../.agents/@montflow/prompts/spec-execute.json (from .../packages/specs/prompts/spec-execute.json)
Run: mf-specs doctor
exit=1
```

Hashes after that check (unchanged, so `--check` wrote nothing):

```
6d4c4688eac647a98624f7c1c20aeaa82863c2af08732499a027cc8c924eacc3  .../prompts/commit.json
45625a69614eb55a4a8df2beddab364732717059d2f2d41912cd85a0fda25764  .../prompts/effect-review.json
febc97912d82501d0c336743867e48c753e76ca02fe6b35657424d1e03c75fc9  .../prompts/spec-create.json
```

Repair mode:

```
$ bun run --cwd packages/specs cli doctor --dir /tmp/opencode/b002-demo
+ spec skills and prompts installed.
+ montflow-create-pi-specs: installed → ...
+ montflow-find-pi-specs: installed → ...
+ spec-create: installed → /tmp/opencode/b002-demo/.agents/@montflow/prompts/spec-create.json
+ spec-execute: installed → /tmp/opencode/b002-demo/.agents/@montflow/prompts/spec-execute.json
exit=0

$ cmp packages/specs/prompts/spec-create.json /tmp/opencode/b002-demo/.agents/@montflow/prompts/spec-create.json
spec-create repaired byte-identical
$ cmp packages/specs/prompts/spec-execute.json /tmp/opencode/b002-demo/.agents/@montflow/prompts/spec-execute.json
spec-execute installed byte-identical
```

Unrelated prompts kept their exact pre-run hashes:

```
6d4c4688eac647a98624f7c1c20aeaa82863c2af08732499a027cc8c924eacc3  .../prompts/commit.json
45625a69614eb55a4a8df2beddab364732717059d2f2d41912cd85a0fda25764  .../prompts/effect-review.json
```

The test suite repeats this mechanically: unrelated sentinels are deliberately
invalid prompt JSON (`commit.json` is not JSON at all) so doctor would fail if it
ever read or parsed them, and the tests assert byte equality after missing
install, stale check, and stale repair.

### Final gates (verbatim, run after the last edit)

```
$ bun run --cwd packages/specs test
 Test Files  70 passed (70)
      Tests  650 passed (650)
Type Errors  no errors
exit=0
```

```
$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
(node:662109) [MODULE_TYPELESS_PACKAGE_JSON] Warning: ... (Node config notices only)
exit=0
```

```
$ bun run --cwd packages/specs format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 465ms on 142 files using 16 threads.
exit=0
```

```
$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
exit=0
```

```
$ bun run mf:check:specs
6 specs · 0 failed · 0 issues · 79 warnings
$ bun run src/apps/cli/main.ts doctor --check --dir /home/daniel/dev/montflow/spec-optimizations
✓ spec skills and prompts are installed and up to date.
✓ ... (both skills and both prompts, as quoted above)
exit=0
```

The 79 warnings are the pre-existing `size: Completed task declares no size`
advisories on historical specs (A004's territory); there are no errors and no
failed specs.

```
$ bun run mf:check:prompts
4 prompts · 0 issues · 0 warnings
✓ prompts skills are installed and up to date.
✓ montflow-create-pi-prompts: up to date → .agents/skills/montflow-create-pi-prompts
✓ montflow-execute-pi-prompts: up to date → .agents/skills/montflow-execute-pi-prompts
exit=0
```

### Behaviour decisions

- Prompt repair mode reports `installed` when it wrote (missing or stale) and
  `present` when the copy already matched, so the aggregate stays exactly
  `ok` / `present` / `installed` / `drifted`. Check mode reports `ok` /
  `missing` / `stale` and never writes.
- A current prompt is compared before every repair run, so doctor never rewrites
  an identical file. Skills keep their original presence-only repair semantics.
- `SPEC_PROMPT_NAMES` is the single ownership list. D002 can add
  `spec-sizing` there without touching the install logic.

## Open Questions

1. **`packages/specs/src/apps/cli/CONTEXT.md` still describes doctor as
   skills-only** (line 47 and the "install the packaged spec skills" comment in
   the Running block). It is outside this task's ownership boundary, so it was
   not edited. Follow-up: one paragraph mentioning
   `.agents/@montflow/prompts/` and `--check` prompt reporting.
2. **`spec-sizing.json` is not owned yet.** SPEC lines 79/125 and D002 add it as
   the third shipped prompt. The only change needed is appending `'spec-sizing'`
   to `SPEC_PROMPT_NAMES`; install/repair/report are name-driven.
3. **`mf-specs doctor` output changed shape** (per-item lines instead of an
   aggregate skills-only sentence). No in-repo consumer asserts the old text;
   an external script that greps the old sentence would need updating. This was
   required to report `ok` / `missing` / `stale` per prompt file.

## Handoff

- **D002**: add `spec-sizing` to `SPEC_PROMPT_NAMES`; placed at
  `packages/specs/prompts/spec-sizing.json`, it is installed into
  `.agents/@montflow/prompts/spec-sizing.json` with no other code change.
- **C001/C003/C005**: the canonical prompt directory and doctor sync rule are
  live; load prompts by name from the package copy and let doctor own the
  workspace copies.
- **B003/B004**: rename skill constants in
  `doctor.apps.module.ts` (`SPEC_SKILL_NAMES`) when the skills drop `-pi-`; the
  prompt names and paths are already token-free.
- **Reviewers**: the proof to judge is (a) unrelated prompts are byte-identical
  after both modes, (b) `--check` leaves hashes and `mtime` unchanged, (c) a
  stale owned prompt is replaced byte-for-byte by repair mode, (d) the aggregate
  status unions skills and prompts.

## Deviations

- **Renderer style changed in `cli.apps.module.ts`.** Doctor wiring required
  reporting prompts, and the requested fix line is `Run: mf-specs doctor`, so
  `renderDoctor` moved to the per-item line style already used by the prompts,
  skills, and reviews packages. The old aggregate sentence is gone.
- **Formatting was computed through a scratch copy** at `/tmp/opencode/b002-fmt`
  with the same `.oxfmtrc.json`, because `format:fix` is package-wide and
  sibling workers had unformatted in-flight files. Only the three resulting
  hunks in this task's files were applied; final `format:check` passes on the
  real package.
- **`cli/CONTEXT.md` was not updated** — outside the ownership boundary (see
  Open Question 1).
- **No `BOARD.md` broadcast**: this phase has no `BOARD.md`, and the dispatch
  limits writes to this `MEMORY.md`.
- **No prompt writes in this task.** Repair mode was exercised in
  `/tmp/opencode/b002-demo`; on the real repo both copies were already current,
  so `doctor` wrote nothing.
