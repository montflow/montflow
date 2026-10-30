# Memory

## Context

Read-only inventory of the payload + `doctor` surface across the five extension
packages named by A002 (`pi-skills`, `pi-prompts`, `pi-specs`, `pi-sessions`,
`pi-profiles`), so B003's payload-manifest decision rests on measured state.
Every package ships its payload as a `skills/` directory (no `payload/` dir
exists anywhere). `pi-profiles` ships nothing and has no `doctor`. `pi-reviews`
was not in A002's list but surfaced as the third copy of the embedded generator.

## Progress

- 2026-10-15: complete

## Findings

### Per-package table

| Package | payload dir | artifact kinds | `doctor` name list (source) | compare mode | write mode | compiled binary |
| --- | --- | --- | --- | --- | --- | --- |
| `pi-skills` | `packages/pi-skills/skills/` (2 dirs) | skills (`SKILL.md` + `CHANGELOG.md`) | `SKILL_NAMES = ['montflow-create-pi-skills','montflow-modify-pi-skills']` — `src/apps/doctor/doctor.apps.module.ts:16` | **contents + file set** (`sameFiles` :115, byte compare `firstDifference` :193) | writes unless `--check` (`DoctorOptions.check` :78, `runDoctor` :226) | **WORKS** via embedded fallback (`EMBEDDED_SKILL_PAYLOAD` :162) |
| `pi-prompts` | `packages/pi-prompts/skills/` (2 dirs) | skills (`SKILL.md` + `CHANGELOG.md`) | `SKILL_NAMES = ['montflow-create-pi-prompts','montflow-execute-pi-prompts']` — `src/apps/doctor/doctor.apps.module.ts:21` | **contents + file set** (byte compare `firstDifference` :216) | writes unless `--check` (`DoctorOptions.check` :90, `runDoctor` :249) | **WORKS** via embedded fallback (:185) |
| `pi-specs` | `packages/pi-specs/skills/` (2 dirs) | skills | `SPEC_SKILL_NAMES = ['montflow-create-pi-specs','montflow-find-pi-specs']` — `src/apps/doctor/doctor.apps.module.ts:10` | **presence only** (`exists(sourceFile)` :64, `exists(target/SKILL.md)` :68 — never reads contents) | **ALWAYS writes**; no `--check` at all (`runDoctor(root)` :97 takes no options; CLI `doctorCommand` `Command.make('doctor', {}, …)` `src/apps/cli/cli.apps.module.ts:908` declares no flags) | **FAILS** (experiment below) |
| `pi-sessions` | `packages/pi-sessions/skills/` (1 dir) | skills | `SESSION_SKILL_NAME = 'montflow-dispatch-pi-sessions'` — `src/apps/doctor/doctor.apps.module.ts:10` | **presence only** (`exists` :61, :67 — never reads contents) | writes unless `--check` (`DoctorOptions.check` :33, :71); `--check` parsed at `src/apps/commands/commands.apps.module.ts:256-259` | **FAILS** (experiment below) |
| `pi-profiles` | none (no `skills/`, no payload) | none | none | N/A | N/A | N/A — **no `doctor`** (no `src/apps/doctor/`; CLI is `list/show/verify/create/modify/delete`, `src/apps/cli/binary.apps.module.ts:193-200`) |

- `pi-skills`/`pi-prompts` “freshness” = byte compare; `pi-specs`/`pi-sessions`
  only ever ask “is `SKILL.md` there?”, so drift is invisible to them.
- `pi-reviews` (outside the A002 list, same family): ships 2 review skills,
  compares contents (`sameFiles` :107, `firstDifference` :183), has an embedded
  payload, and uses `--check` in its verify script.

### CI-writes-during-verify defect (confirmed)

Root `package.json` scripts:
- `:25 verify:montflow:skills` → `… cli doctor --check --dir $PWD`
- `:26 verify:montflow:prompts` → `… cli doctor --check --dir $PWD`
- `:27 verify:montflow:specs` → `… cli check --dir $PWD` (the `check` verb, not `doctor`)
- `:28 verify:montflow:profiles` → `… cli verify --dir $PWD` (no doctor exists)
- `:29 verify:montflow:sessions` → **`bun run --cwd packages/pi-sessions cli doctor`** — **no `--check`**
- `:30 verify:montflow:reviews` → `… cli doctor --check --dir $PWD`

CI runs each as its own matrix cell (`.github/workflows/verify.yml:61-62`, then
`run: bun run ${{ matrix.script }}` :84). So `verify:montflow:sessions` is the
**only** extension verify that invokes an *installing* `doctor`.

Exact command → observed effect on a fresh git root (`/tmp/opencode/a002-exp/ci-repo`,
`git init`, empty `.agents`):
```
$ bun run packages/pi-sessions/src/apps/cli/main.ts doctor   # == the cli script body, no --check
Installed session skill 'montflow-dispatch-pi-sessions' at /tmp/opencode/a002-exp/ci-repo/.agents/skills/montflow-dispatch-pi-sessions.
exit=0
wrote: .agents/skills/montflow-dispatch-pi-sessions/SKILL.md
       .agents/skills/montflow-dispatch-pi-sessions/CHANGELOG.md
```
Plain statement: **`verify:montflow:sessions` mutates the working tree during
“verify”.** When `<root>/.agents/skills/montflow-dispatch-pi-sessions` is absent
it copies the package payload there (`doctor.apps.module.ts:75-90`) and still
exits 0. In *this* repo the skill is git-tracked
(`git ls-files .agents/skills/montflow-dispatch-pi-sessions` lists both files) and
byte-identical to the package (`diff -r` → IDENTICAL), so the real run today is a
no-op that prints `Session skill 'montflow-dispatch-pi-sessions' is installed at
/home/daniel/…/.agents/skills/montflow-dispatch-pi-sessions.` (exit 0, `git status`
clean) — the defect is structural and latent: the command *can* write, and is not
report-only, unlike skills/prompts/reviews.

### Compiled-binary payload gap (confirmed by experiment)

Built each CLI with the same command as its `build:cli`, into `/tmp/opencode/a002-exp`
(note: `pi-specs`/`pi-sessions` `bun build … --compile --outfile …`; the
`build:cli` scripts hardcode `--outfile dist/mf-*` *inside the package*, which
would mutate files outside `.agents`, so the underlying command was pointed at
`/tmp` — see Deviations). Run from a fresh `git init` root:

```
$ /tmp/opencode/a002-exp/mf-specs doctor
ERROR
  doctor: packaged skill 'montflow-create-pi-specs' is missing at '/skills/montflow-create-pi-specs'
exit=1                       # .agents not written
$ /tmp/opencode/a002-exp/mf-sessions doctor
doctor: packaged skill 'montflow-dispatch-pi-sessions' is missing at '/skills/montflow-dispatch-pi-sessions'
exit=1                       # .agents not written
```
Root cause: `shippedSkillDir` resolves
`path.resolve(import.meta.dirname,'..','..','..')` (`pi-specs` `doctor.apps.module.ts:21-22`,
`pi-sessions` `:15-16`). Inside a `bun build --compile` bundle `import.meta.dirname`
is `/`, so it looks in `/skills/<name>`. Neither package has an
`embedded-payload.generated.ts` (`find packages/pi-{specs,sessions} -name
'embedded-payload.generated.ts'` → none), so there is no fallback.

Contrast (both directions proven):
- **From source**, the same two commands work: `Installed spec skills '…' into …/.agents/skills/.` and `Installed session skill '…' at …` (exit 0) — the gap is compile-specific.
- **`pi-skills`/`pi-prompts` compiled binaries work**: `mf-skills doctor` →
  `+ skills repaired.` (installs both skills from embedded); `mf-prompts doctor`
  → `+ prompts skills repaired.` (both from embedded). Their `--check` runs
  reported `missing` (resolved payload) rather than the “not available … not
  embedded” failure, proving the embedded path is what saves them.

### Embedded-generator duplication

There are **three** near-identical generators, not two:
`packages/pi-skills/scripts/generate-embedded-skills.ts` (79 lines),
`packages/pi-prompts/scripts/generate-embedded-skills.ts` (80),
`packages/pi-reviews/scripts/generate-embedded-skills.ts` (81).

`diff` pi-skills vs pi-prompts: identical **except** the functional
`SKILL_NAMES` constant (`:30` vs `:31`) and comment wording (`:17`, `:20-21`,
`:53-54`, `:58-59`). `diff` pi-skills vs pi-reviews: identical except
`SKILL_NAMES` (`:30` vs `:29-32`) and comment wording (`:9-12`, `:17-20`, `:60`).
Same body: readdir `skills/<name>`, reject a skill without `SKILL.md`, emit
`export const EMBEDDED_SKILL_PAYLOAD = <JSON.stringify>`, byte-count log.

Cost of one more copy: ~80 duplicated lines + one generated
`embedded-payload.generated.ts` + one divergence test
(`src/apps/doctor/tests/embedded-payload.test.ts`, present for all three) +
`build:cli`/`generate:payload` script entries — all hand-synced. `pi-specs` and
`pi-sessions` each need one to work compiled, i.e. **two** more copies → five
total, which is why a shared parameterised generator is the obvious target.

## Open Questions

- Does the intended fix make `verify:montflow:sessions` report-only by passing
  `--check` (and accept that it then *fails* on a missing skill, per
  `commands.apps.module.ts:387-391`), or is the payload installed elsewhere so
  verify never needs to write? B003's call.
- `pi-specs` has no `--check` flag on `doctor` at all (`cli.apps.module.ts:908`);
  a report-only CI contract needs one added, not just a flag pass-through.

## Handoff

- B003 payload-manifest inputs: one shared embedded-payload generator (three
  copies already, two more would be needed); an embedded copy for `pi-specs` and
  `pi-sessions`; `--check` added to `pi-specs doctor`; `--check` passed by
  `verify:montflow:sessions`.
- `pi-profiles` ships no payload and has no `doctor` — the profiles package in
  the manifest question is a no-op unless Phase C adds one.

## Deviations

- Task stated the embedded generator “exists twice”; it exists **three** times
  (`pi-reviews` has the third). Recorded as a correction.
- Built binaries with the underlying `bun build … --compile --outfile /tmp/opencode/…`
  rather than invoking each `build:cli` verbatim, because `build:cli` writes
  `dist/mf-*` inside the package (a file outside `.agents/@montflow/specs/`).
  Same compiler/flags; only the output path differs, to honour the no-modification limit.
- `pi-reviews` was inspected opportunistically (generator/embedded count); it is
  outside A002's five-package scope.
