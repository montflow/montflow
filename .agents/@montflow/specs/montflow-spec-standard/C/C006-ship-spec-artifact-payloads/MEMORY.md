# Memory

## Context

C006 ships the spec artifact payload. Main already shipped `spec-create`,
`spec-execute`, and `spec-sizing` from `packages/specs/prompts` through
`doctor`, and C004 had seeded the six profile directories in
`packages/profiles/profiles/`. This task adds the three tier instruction files
and their manifest entries, rewrites the six profiles and three prompts to the
v2 vocabulary, adds the tier table and `init` guidance to the authoring skill,
adds the B003 drift test and the embedded-tier guard, and proves that a clean
workspace repairs every artifact through one `mf:doctor` run.

C008 was editing the CLI/TUI surfaces concurrently during this run. Its
uncommitted files were never edited here; the only `src/apps` files touched are
three test files whose prompt-content or doctor-count assertions this task
changed.

## Progress

- 2026-11-03: read C006 `TASK.md`/`GATES.md`/`MEMORY.md`, B003 F1–F9,
  B005 F1–F8, C004 and C005 memories, the current profiles, prompts, skill,
  tier module, doctor paths, embedded-payload tests, and prompt tests.
- 2026-11-03: wrote `packages/specs/tiers/{micro,standard,full}.md` from B003
  F3/F4 and F6 frontmatter; added the three `tier` entries to
  `packages/specs/payload.json` and `tiers` to the package `files` array.
- 2026-11-03: rewrote the six canonical profiles in
  `packages/profiles/profiles/` for v2: tier load, split shape, phase
  directories, derived locks, `claim` transitions, `gate run`, `mail`, and the
  verbs each role may call.
- 2026-11-03: rewrote `spec-create` around appraise → load tier → `init` →
  `## Creation`; added the orchestrator-only set and the `--block`/`--release`
  reset to `spec-execute`; added the phase-directory and derived-lock wording
  to `spec-sizing`.
- 2026-11-03: added the tier table, `init` scaffold, `waiver`, and tier
  self-check to `montflow-create-specs`; bumped it to 2.13.0.
- 2026-11-03: added `src/modules/tier/tests/drift.test.ts` (enum ↔ files ↔
  contract ↔ prose ↔ skill table ↔ appraiser/split text ↔ non-restatement) and
  extended `embedded-payload.test.ts` with `EMBEDDED_TIER_PAYLOAD`.
- 2026-11-03: updated the prompt-content and doctor-count assertions this task
  changed; regenerated both embedded payloads; installed with `mf:doctor`.
- 2026-11-03: ran all gates and the clean-workspace repair demonstration.

## Findings

### Tier files and manifest

- `packages/specs/tiers/micro.md` — `1` phase, exploration forbidden, max `2`
  work tasks, `command-per-task`, review waived, waiver permitted, `0`
  questions, grilling forbidden.
- `packages/specs/tiers/standard.md` — `1–2` phases, exploration optional (one
  exploratory task, first phase), max `6` work tasks (`4` per phase),
  `per-task`, review required, waiver `records-only`, `2` questions, grilling
  not loaded.
- `packages/specs/tiers/full.md` — `2–4` phases, exploration required as phase
  `A`, max `12` work tasks (`6` per phase), `phase-and-task`, review required,
  waiver forbidden, `8` questions, grilling required.
- Each file carries the full artifact matrix, and each carries the exact
  sentence form `This run may ask at most <n> questions.`; the body also states
  that `questions <n>/<budget>` is self-reported and advisory.
- `packages/specs/payload.json` now has three `tier` entries with sources
  `tiers/<tier>.md` and targets `.agents/@montflow/tiers/<tier>.md`.
  `packages/specs/package.json` ships the `tiers` directory.
- `mf-specs tier micro` prints the installed file (exit 0); `mf-specs tier
  split` refuses with `tier.unknown` (exit 1).

### Profiles

- `spec-appraiser`: field 6 (interaction budget) removed; the exact `split`
  shape (`verdict`, `cut`, `count`, `specs`, `slug`, `tier`, `scope`,
  `evidence`) is stated verbatim; it names all three tiers and
  `mf-specs tier` but loads no tier file and enumerates no tier matrix.
- `spec-creation-orchestrator`: appraise → stop on split → load exactly one
  tier with `mf-specs tier <tier>` → `init`/`new-phase`/`new-task`/`waiver` →
  update the `## Creation` count → bookkeeper; no reserved review task.
- `spec-execution-orchestrator`: binds with `claim --orchestrator`; names the
  orchestrator-only `claim --start`, `claim --block`, `claim --close`, the
  resetting `claim --release`, `gate run`, `gate record`, and `mail`; derived
  locks come only from `lock`.
- `spec-worker`: binds its own session, never calls an orchestrator-only verb,
  never writes a channel, and reports questions in `MEMORY.md`.
- `spec-bookkeeper`: verifies through package scripts and `mf:doctor`; removed
  the nonexistent `bun run sync:montflow`, and names only existing verbs.
- `spec-sizing-orchestrator`: phase ids are directory names; a derived lock is
  never written by a sizing run.

### Prompts and skill

- `spec-create` is now: intent → appraise (`spec-appraiser`) → split stop →
  `mf-specs tier <tier>` exactly once → `init` → `## Creation` with
  `tier`/`questions <n>/<budget>`/`unresolved` → size every task (the landed
  size contract is unchanged) → phase rules (no reserved review task, derived
  lock) → `check`.
- `spec-execute` adds the orchestrator-only section and the
  `claim --block`/resetting `claim --release` return path; its existing
  `claim`, `gate run`, `gate record`, `mail`, `lock`, `state`, and `next`
  guidance is unchanged.
- `spec-sizing` now names the phase directory as the phase id and states that a
  derived lock is confirmed by `mf-specs lock`, never written by sizing.
- `montflow-create-specs` 2.13.0 adds the tier table with the exact columns
  `Tier | Phases | Exploration | Tasks | Review | Questions`, the `init`
  tier-aware scaffold, `waiver`, and the `## Creation` self-check. The sizing
  section contains no tier name.

### Drift test

`packages/specs/src/modules/tier/tests/drift.test.ts` has six `it` blocks:

1. enum ↔ file set (stems equal `TIERS`, no extra file, stem equals `tier:`);
2. enum ↔ file contract (every frontmatter field and both artifact arrays);
3. enum ↔ file prose (the question sentence equals `interaction`);
4. enum ↔ skill table (one row per tier, exact columns/values);
5. enum ↔ appraiser and prompt (every `SPLIT_FIELDS` token, every tier,
   `mf-specs tier`, and no tier matrix row);
6. non-restatement (no size word, `size:`, `sizing.json`, `model`, `effort`, or
   `review cycle` in a tier file; no tier name in the skill sizing section;
   `isTier(SPLIT)` false, `split` absent from `TIERS`).

`embedded-payload.test.ts` now asserts the generated `tier` bucket equals the
packaged bytes and contains exactly `SPEC_TIER_NAMES`.

### Clean-workspace repair demonstration

Copied the working tree to `/tmp/opencode/c006-clean/repo`, kept the
workspace-only skills/profiles, and removed the payload-owned artifacts:
`.agents/skills/montflow-create-specs`, `montflow-find-specs`,
`montflow-adversarial-review`, `montflow-addressing-adversarial-review`,
`.agents/@montflow/prompts`, `.agents/@montflow/tiers`, and the six package
profiles.

```
$ bun run mf:doctor
REPAIR_EXIT=0
+ spec skills and prompts installed or repaired.
+ montflow-create-specs: installed
+ montflow-find-specs: installed
+ spec-create: installed
+ spec-execute: installed
+ spec-sizing: installed
+ micro: installed
+ standard: installed
+ full: installed
+ profiles installed or repaired.
✓ spec-appraiser: installed PROFILE.md
✓ spec-bookkeeper: installed PROFILE.md
✓ spec-creation-orchestrator: installed PROFILE.md
✓ spec-execution-orchestrator: installed PROFILE.md
✓ spec-worker: installed PROFILE.md
✓ spec-sizing-orchestrator: installed PROFILE.md
...
summary checks=8 failed=0 repaired=1

$ bun run mf:check
CHECK_EXIT=0
46 skills · 0 issues
4 prompts · 0 issues · 0 warnings
14 specs · 0 failed · 0 issues · 13 warnings
12 profiles · 0 issues · 0 warnings
2 files · 0 issues
summary checks=8 failed=0 repaired=0

$ bun run --cwd packages/profiles cli verify --dir "$PWD"
12 profiles · 0 issues · 0 warnings
$ bun run --cwd packages/prompts cli verify --dir "$PWD"
4 prompts · 0 issues · 0 warnings
```

Exactly six package profiles were installed (the six names in the manifest),
alongside the untouched workspace-only profiles; all three tier files were
installed; `diff -r` of the tiers and sampled profiles/prompts against this
checkout was identical. The extra prompts/specs warnings are the pre-existing
v1 `spec.version-outdated` and reviewer-profile warnings, not issues.

### Verb and skill resolution

Every `mf-specs <verb>` token in `packages/specs/skills`,
`packages/specs/prompts`, and `packages/profiles/profiles` (excluding historical
CHANGELOG entries) is in the CLI's 26-verb help list. The only non-current token
anywhere is `mf-specs discover` in the historical `montflow-find-specs`
CHANGELOG, which documents the rename to `list`. `profiles verify` and
`prompts verify` report `0 issues · 0 warnings` in the real workspace and in the
clean copy.

## Gates (verbatim, run from the repo root)

| Command | Exit | Output |
| --- | --- | --- |
| `bun run mf-specs:check` | 0 | `14 specs · 0 failed · 0 issues · 13 warnings`; doctor `up to date` for 2 skills, 3 prompts, 3 tiers |
| `bun run mf:check` | 0 | `46 skills · 0 issues`; `5 prompts · 0 issues · 0 warnings`; `14 specs · 0 failed · 0 issues · 13 warnings`; `12 profiles · 0 issues · 0 warnings`; `2 files · 0 issues`; `summary checks=8 failed=0 repaired=0` |
| `bun run ts:check` | 0 | `Tasks: 17 successful, 17 total` |
| `bun run lint:check` | 0 | `Tasks: 17 successful, 17 total` |
| `bun run fmt:check` | 0 | `Tasks: 17 successful, 17 total` |
| `bun run --cwd packages/specs test -- --run` | 0 | `Test Files 124 passed (124)`, `Tests 1687 passed (1687)`, `Type Errors no errors` |
| `bun run --cwd packages/prompts test` | 0 | `Test Files 50 passed (50)`, `Tests 599 passed (599)` |
| `bun run --cwd packages/profiles test` | 0 | `Test Files 40 passed (40)`, `Tests 192 passed (192)` |
| `bun run --cwd packages/skills test` | 0 | `Test Files 46 passed (46)`, `Tests 417 passed (417)` |
| `bun run mf:doctor` (real workspace) | 0 | installed/repaired the spec skills, prompts, tiers, and six profiles |
| `bun run mf:doctor` (clean copy) | 0 | repaired all payload artifacts, `summary checks=8 failed=0 repaired=1` |
| `bun run mf:check` (clean copy) | 0 | `summary checks=8 failed=0 repaired=0`; `0 issues` on every payload family |

The `mf:check` write-free proof: `git status --porcelain | sha256sum` was
identical before and after (`GIT_IDENTICAL`).

Focused test runs: the drift suite is `2 files / 12 tests passed`; the prompt
and embedded suite is `4 files / 55 tests passed`.

## Completion evidence

- **Clean workspace gains all artifacts; report-only silent/zero issues.** The
  `mf:doctor` run above installed 2 spec skills, 3 prompts, 3 tiers, and 6
  profiles; the following `mf:check` exited 0 with `0 issues` on every family.
- **Exactly six spec-role profiles.** `find .agents/@montflow/profiles -maxdepth
  1 -mindepth 1 -type d` lists the six: `spec-appraiser`, `spec-bookkeeper`,
  `spec-creation-orchestrator`, `spec-execution-orchestrator`,
  `spec-sizing-orchestrator`, `spec-worker`. The workspace-only profiles remain
  and are never touched by doctor.
- **Every `skills:` reference resolves.** `profiles verify` and `prompts verify`
  each report `0 issues · 0 warnings` in this workspace and in the clean copy
  (A004 warnings would appear here).
- **Every named verb exists.** The extracted `mf-specs <verb>` set has no
  unknown member against the 26-verb CLI; only the historical CHANGELOG names
  `discover`.
- **Prompts state the orchestrator-only set and advisory questions.**
  `spec-execute` names `claim --start`, `claim --block`, `claim --close`, the
  resetting `claim --release`, `gate run`, `gate record`, and `mail` under
  “The orchestrator-only set”; `spec-create` records
  `questions <n>/<budget>` as self-reported and advisory in `## Creation`.
- **Tier drift.** The drift test compares the enum, files (frontmatter and
  prose), skill table, appraiser/split text, and non-restatement, and passes.
- **Package tests and gates.** All commands in the table above exit 0.

## Open Questions

- None blocking. The clean-copy `mf:check` shows 13 pre-existing
  `spec.version-outdated` warnings and reviewer-profile warnings from the frozen
  v1 specs; these are the same warnings the main workspace carries and are not
  caused by this task.
- `mf-specs discover` remains only in the historical `montflow-find-specs`
  CHANGELOG as the command that was renamed to `list`. No live instruction
  names it.

## Handoff

- **C007** can document the `tier` payload kind, the three tier files, the
  `mf-specs tier` read path, the six installed profiles, and the clean-repair
  command. The drift test and embedded-tier assertion are the mechanical proof.
- **C008** should keep the `/specs tier <tier>` parity and the six profile
  entries on its surface list; this task changed no CLI/TUI module.
- **C009** owns review-cycle policy; this task only names the existing review
  flow and forbids a stored lock in the shipped prompts/profiles.
- A future tier change is one enum edit plus three file edits plus the skill
  table and the drift test will point at every place that must move.

## Deviations

- **Three `src/apps` test files were edited** because this task changed their
  asserted prompt text or the doctor payload count:
  `src/apps/cli/tests/author-execute.test.ts` and
  `src/apps/server/tests/spec-tools.test.ts` now assert the v2
  `## 2. Appraise the complexity` heading; `src/apps/cli/tests/doctor.test.ts`
  computes the payload-line count from the manifest-derived name arrays instead
  of hardcoding 5. No CLI/TUI module was edited.
- **No `TASK.md` status, `GATES.md` checkbox, `SPEC.md`, lock, review store, or
  another task's file was edited.** Only this task's `MEMORY.md` was written
  under the task directory.
- **No new timestamp or status invented.** Progress lines use the environment
  date; mechanical writes came from `mf:doctor`, `generate:payload`, and the
  package test runners.
- **The tier files are shipped separately from the skill** because B003 F6
  requires one file per enum value and no other file in `packages/specs/tiers/`;
  the skill carries only the drift-tested summary table.

## Files touched

New:

- `packages/specs/tiers/micro.md`
- `packages/specs/tiers/standard.md`
- `packages/specs/tiers/full.md`
- `packages/specs/src/modules/tier/tests/drift.test.ts`
- `.agents/@montflow/tiers/micro.md`
- `.agents/@montflow/tiers/standard.md`
- `.agents/@montflow/tiers/full.md`

Changed — canonical payload:

- `packages/specs/payload.json`
- `packages/specs/package.json`
- `packages/specs/prompts/spec-create.json`
- `packages/specs/prompts/spec-execute.json`
- `packages/specs/prompts/spec-sizing.json`
- `packages/specs/skills/montflow-create-specs/SKILL.md`
- `packages/specs/skills/montflow-create-specs/CHANGELOG.md`
- `packages/profiles/profiles/spec-appraiser/PROFILE.md`
- `packages/profiles/profiles/spec-bookkeeper/PROFILE.md`
- `packages/profiles/profiles/spec-creation-orchestrator/PROFILE.md`
- `packages/profiles/profiles/spec-execution-orchestrator/PROFILE.md`
- `packages/profiles/profiles/spec-worker/PROFILE.md`
- `packages/profiles/profiles/spec-sizing-orchestrator/PROFILE.md`
- `packages/profiles/CHANGELOG.md`
- `packages/specs/CHANGELOG.md`

Changed — generated payload:

- `packages/specs/src/modules/doctor/embedded-payload.generated.ts`
- `packages/profiles/src/apps/doctor/embedded-payload.generated.ts`

Changed — installed copies (via `mf:doctor`, not hand-copied):

- `.agents/@montflow/profiles/spec-*/PROFILE.md` (the six)
- `.agents/@montflow/prompts/spec-{create,execute,sizing}.json`
- `.agents/skills/montflow-create-specs/{SKILL.md,CHANGELOG.md}`

Changed — tests:

- `packages/specs/src/modules/doctor/tests/embedded-payload.test.ts`
- `packages/specs/src/modules/prompt/tests/prompt.test.ts`
- `packages/specs/src/apps/cli/tests/doctor.test.ts`
- `packages/specs/src/apps/cli/tests/author-execute.test.ts`
- `packages/specs/src/apps/server/tests/spec-tools.test.ts`

Changed — this task record:

- `.agents/@montflow/specs/montflow-spec-standard/C/C006-ship-spec-artifact-payloads/MEMORY.md`

## Orchestrator Verification (2026-11-03)

Independent gate run from the repo root after the worker receipt:

```
$ bun run --cwd packages/specs test -- --run
 Test Files  124 passed (124)
      Tests  1687 passed (1687)
Type Errors  no errors
EXIT=0

$ bun run mf-specs:check
14 specs · 0 failed · 0 issues · 13 warnings
EXIT=0

$ bun run mf:gate:fast   # lint + fmt + ts + mf:check
 Tasks:    17 successful, 17 total   (lint)
 Tasks:    17 successful, 17 total   (format)
 Tasks:    17 successful, 17 total   (ts)
summary entries=14 issues=0 warnings=0
summary checks=8 failed=0 repaired=0
EXIT=0

$ bun run --cwd packages/prompts test  -> 599 passed, EXIT=0
$ bun run --cwd packages/profiles test -> 192 passed, EXIT=0
$ bun run --cwd packages/skills test   -> 417 passed, EXIT=0

static: packages/profiles/profiles and .agents/@montflow/profiles both hold the
same six spec-role profiles; packages/specs/tiers and .agents/@montflow/tiers
hold micro/standard/full; payload.json has 3 tier entries; the shipped prompts
name the orchestrator-only claim forms, gate run, mail, and self-reported
questions.
```

All completion items are supported; task recorded complete by the orchestrator.
