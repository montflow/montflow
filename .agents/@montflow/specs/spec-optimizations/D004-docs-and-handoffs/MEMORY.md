# Memory

## Context

D004 `docs-and-handoffs` teaches the phase-D flow where creators, executors, and
reviewers look for it: the README wizard narrative, the authoring skill's
authoring-versus-generation boundary, the creation/execution profile handoff to
`spec-sizing-orchestrator`, the root `AGENTS.md` prompt contract, and the agent
CLI-surface doc.

Worktree `/home/daniel/dev/montflow/spec-optimizations`, branch
`feat/spec-optimizations`. Depends on D001 (catalogue + `models`), D002
(`spec-sizing` prompt + profile), D003 (`sizing-config` / `spec_sizing` /
`/specs sizing-config`). All three had landed; this run documented them.

Scope held to D004: documentation, the two profile handoffs, the authoring skill
plus its byte-identical mirror and CHANGELOG, the embedded-payload regeneration
that a packaged-skill change mechanically requires, and this MEMORY. No behavior
change, no `SPEC.md`, task status, lock, other task directory, historical spec
record, or old CHANGELOG entry edits; no `ask_user`; no git commit.

## Progress

Done.

Files modified:

- `packages/specs/README.md` — new `models` bullet in the CLI list; new
  `### Generating a sizing config` section after `### Merge rule` (seven wizard
  steps, catalogue rationale, the `null` / `[]` / exact-token effort rule, open
  vs fixed scope, `inherit`, the one-layer merge, the proof loop, and one
  transcript with placeholder ids); `Catalogue` and the `models` engines added
  to the library surface.
- `packages/specs/skills/montflow-create-specs/SKILL.md` — `2.6.0 -> 2.7.0`;
  step 5 gains the boundary paragraph (size is chosen while authoring, config is
  generated afterwards by `spec-sizing`; never type a model id or effort); the
  reference gains the catalogue CLI and the sizing prompt.
- `packages/specs/skills/montflow-create-specs/CHANGELOG.md` — `2.7.0` entry.
- `.agents/skills/montflow-create-specs/{SKILL,CHANGELOG}.md` — doctor-repaired
  mirrors, byte-identical (never hand-edited).
- `.agents/@montflow/profiles/spec-creation-orchestrator/PROFILE.md` — new
  `### Hand the config to the sizing role` section naming
  `spec-sizing-orchestrator` as the role that loads `spec-sizing`; checklist item
  forbidding a hand-typed config.
- `.agents/@montflow/profiles/spec-execution-orchestrator/PROFILE.md` — new
  `### Missing config goes to the sizing role` section for a spec or phase, the
  `sizing-config` / `/specs sizing-config` / `spec_sizing` surfaces, and
  `inherit` as the honest fallback; checklist item added.
- `AGENTS.md` — `## Spec prompts` now lists `spec-sizing` as a third canonical
  prompt, documents `mf-specs sizing-config` in the render list, and states the
  never-hand-write-a-model-or-effort rule.
- `.agents/documentation/author-mf-utility-cli.md` — the `mf-specs` row in the
  CLI surface table now lists every live verb (`author`, `execute`, `which`,
  `models`, `resolve`, `sizing`, `sizing-config` included).
- `packages/specs/src/apps/doctor/embedded-payload.generated.ts` — regenerated
  with `bun run --cwd packages/specs generate:payload` (the packaged skill bytes
  changed; the embed test failed until this ran).
- `.agents/@montflow/specs/spec-optimizations/D004-docs-and-handoffs/MEMORY.md`
  (this file).

## Findings

- **The CONTEXT files were already current.** D003 had fixed
  `apps/doctor/CONTEXT.md`, `modules/prompt/CONTEXT.md`, and `apps/cli/CONTEXT.md`
  to three prompts, so no CONTEXT edit was needed here. The one live document
  still enumerating only two prompts was the root `AGENTS.md` contract; the
  README listed three but had no `models` coverage at all.
- **The README's `models` coverage was the real gap.** `grep -n "models\|catalogue"
  packages/specs/README.md` returned nothing before this run. The new section is
  also the first place that connects the catalogue to the wizard: the effort rule
  (`variants unknown` and `variants none` both forbid an effort), the
  `--catalog`/host resolution split, and `models --verify` as proof.
- **The transcript is grounded in real output.** A throwaway probe at
  `/tmp/opencode/d004-probe` (copied `mock-ok` as `ship-login`, placeholder
  catalogue) produced the exact `models`, `models --verify`, `check`, and
  `sizing --human` shapes quoted in the README; the wizard lines are labelled
  `[wizard]` so they are not read as command output.
- **The embedded payload is a mechanical consequence of any packaged-skill
  change.** `packages/specs test` failed `embedded-payload.test.ts` until
  `generate:payload` ran; the regenerated file reports `2 skills (20626 bytes), 3
  prompts (24053 bytes)`. `doctor` alone does not refresh the embed.
- **No packaged profile mirror exists.** The orchestrator profiles live only in
  `.agents/@montflow/profiles/`; `mf:check:profiles` verifies them in place, so
  there was no second copy to sync.
- **Mirror identity is doctor-owned.** The two skill files were repaired by
  `mf-specs doctor`, not copied by hand; the sha256 pairs below prove it.

## Evidence

### Verification gate (verbatim)

```
$ bun run mf:check
46 skills · 0 issues
5 prompts · 0 issues · 0 warnings
✓ prompts skills are installed and up to date.
6 specs · 0 failed · 0 issues · 79 warnings
✓ spec skills and prompts are installed and up to date.
✓ spec-sizing: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/@montflow/prompts/spec-sizing.json
12 profiles · 0 issues · 0 warnings
8 files · 0 issues
MFCHECK_EXIT=0
```

The 79 warnings are the pre-existing `task.missing-size` advisories on historical
completed tasks; every scope reports zero issues.

```
$ bun run mf:check:skills
46 skills · 0 issues
✓ skills are installed and up to date.
✓ montflow-create-skills: up to date → .../.agents/skills/montflow-create-skills
✓ montflow-modify-skills: up to date → .../.agents/skills/montflow-modify-skills
SKILLS_EXIT=0
```

```
$ bun run mf:check:prompts
5 prompts · 0 issues · 0 warnings
✓ prompts skills are installed and up to date.
✓ montflow-create-prompts: up to date → .../.agents/skills/montflow-create-prompts
✓ montflow-execute-prompts: up to date → .../.agents/skills/montflow-execute-prompts
PROMPTS_EXIT=0
```

```
$ bun run mf:check:profiles
12 profiles · 0 issues · 0 warnings
PROFILES_EXIT=0
```

```
$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
(node:...) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///.../oxlint.config.ts?cache=... is not specified and it does not parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:...) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///.../tooling/oxlint/anti-slop/effect/index.ts is not specified and it does not parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/spec-optimizations/tooling/oxlint/package.json.
LINT_EXIT=0
```

The only lint output beyond the script echo is Node's
`MODULE_TYPELESS_PACKAGE_JSON` notice for root/tooling config; it is not a
finding.

```
$ bun run --cwd packages/specs format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 357ms on 152 files using 16 threads.
FORMAT_EXIT=0
```

```
$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
TS_EXIT=0
```

```
$ bun run --cwd packages/specs test
 Test Files  84 passed (84)
      Tests  1007 passed (1007)
Type Errors  no errors
EXIT=0
```

### Stale-prose proof (verbatim)

Every live doc names the third prompt:

```
$ for f in AGENTS.md packages/specs/README.md \
    packages/specs/skills/montflow-create-specs/SKILL.md \
    .agents/skills/montflow-create-specs/SKILL.md \
    packages/specs/src/apps/doctor/CONTEXT.md \
    packages/specs/src/modules/prompt/CONTEXT.md \
    packages/specs/src/apps/cli/CONTEXT.md \
    .agents/@montflow/profiles/spec-creation-orchestrator/PROFILE.md \
    .agents/@montflow/profiles/spec-execution-orchestrator/PROFILE.md; do
  printf "%-75s %s\n" "$f" "$(grep -c 'spec-sizing' "$f")"; done
AGENTS.md                                                                   2
packages/specs/README.md                                                    5
packages/specs/skills/montflow-create-specs/SKILL.md                        3
.agents/skills/montflow-create-specs/SKILL.md                               3
packages/specs/src/apps/doctor/CONTEXT.md                                   2
packages/specs/src/modules/prompt/CONTEXT.md                                2
packages/specs/src/apps/cli/CONTEXT.md                                      1
.agents/@montflow/profiles/spec-creation-orchestrator/PROFILE.md            3
.agents/@montflow/profiles/spec-execution-orchestrator/PROFILE.md           2
```

No live doc still says doctor owns two prompts, and no live doc claims
`spec-sizing` is missing:

```
$ grep -rn "two prompts\|exactly two\|only source of .spec-create. and" \
    AGENTS.md README.md INSTALL.md packages/*/README.md packages/*/src \
    .agents/documentation .agents/@montflow/profiles packages/*/skills \
    .agents/skills --include=*.md
GREP_EXIT=1
```

(`grep` exit `1` is "no match". The only remaining "two prompts" hits in the
tree are inside completed spec records and review rounds, which this task must
not rewrite.)

### Skill mirror identity (verbatim)

```
$ sha256sum packages/specs/skills/montflow-create-specs/SKILL.md \
    .agents/skills/montflow-create-specs/SKILL.md \
    packages/specs/skills/montflow-create-specs/CHANGELOG.md \
    .agents/skills/montflow-create-specs/CHANGELOG.md
1f94cbefcf4b1e480776bf44acfb7cb54116671e46876a5e85c0748aef20b61a  packages/specs/skills/montflow-create-specs/SKILL.md
1f94cbefcf4b1e480776bf44acfb7cb54116671e46876a5e85c0748aef20b61a  .agents/skills/montflow-create-specs/SKILL.md
cef1a52d0bcf7128a28e05b30ed8e3c02e692ad090da5c50a8d23b2277c7c622  packages/specs/skills/montflow-create-specs/CHANGELOG.md
cef1a52d0bcf7128a28e05b30ed8e3c02e692ad090da5c50a8d23b2277c7c622  .agents/skills/montflow-create-specs/CHANGELOG.md
```

### Doctor sync (verbatim)

```
$ bun run --cwd packages/specs cli doctor --dir "$PWD"
+ spec skills and prompts installed or repaired.
+ montflow-create-specs: repaired (rewrote CHANGELOG.md, SKILL.md ('CHANGELOG.md' differs from the package)) → .../.agents/skills/montflow-create-specs
✓ montflow-find-specs: already installed → .../.agents/skills/montflow-find-specs
✓ spec-create: already installed → .../.agents/@montflow/prompts/spec-create.json
✓ spec-execute: already installed → .../.agents/@montflow/prompts/spec-execute.json
✓ spec-sizing: already installed → .../.agents/@montflow/prompts/spec-sizing.json
EXIT=0
```

### Transcript ground truth (verbatim, throwaway probe)

Probe root `/tmp/opencode/d004-probe`, placeholder ids, spec-level config only:

```
$ bun run src/apps/cli/main.ts models --catalog "$P/catalog.json"
provider/cheap-model  variants none
provider/deep-model  variants high,max
provider/standard-model  variants high,low,max  *
EXIT=0

$ bun run src/apps/cli/main.ts models --verify --dir "$P" --name ship-login --catalog "$P/catalog.json"
✓ no model or effort findings
EXIT=0

$ bun run src/apps/cli/main.ts check --dir "$P"
1 spec · 0 failed · 0 issues
EXIT=0

$ bun run src/apps/cli/main.ts sizing --dir "$P" --name ship-login --task A002 --human
A002 · declared small · target provider/standard-model#high · source spec
budget 2 · contributes 2 · phase A budget 2

size    repo    spec                          phase   winner
tiny    absent  provider/cheap-model          absent  spec
small   absent  provider/standard-model#high  absent  spec
medium  absent  provider/standard-model#max   absent  spec
large   absent  -                             absent  inherit
EXIT=0
```

The README transcript reproduces these shapes exactly; no real `sizing.json` was
written into this workspace, and no model id was committed as data.

## Open Questions

1. **`sizing-config` still accepts an unknown spec/phase id.** D003 recorded this
   as deliberate: the command renders the wizard and step 1/2 reports the unknown
   spec through `mf-specs status`. The README now says the wizard reads and
   reports existing state first, which matches. If a reviewer wants an early
   failure, that is a D003 command change, not a docs change.
2. **`.agents/documentation/author-mf-utility-cli.md` has one other stale line:**
   "Domain verbs extend this; never break it (`mf-specs`: `state`/`next`/`lock`)"
   names a `lock` verb that does not exist. It predates this task and touches no
   sizing surface; left untouched to keep the diff scoped.
3. **The `--catalog` resolution split is documented from D001 / the CLI
   CONTEXT, not re-probed here.** The binary resolves relative to the process
   directory and `/specs models` relative to the plugin workspace; a reviewer may
   want one live probe of the slash path.
4. **Root docs have no format gate.** `oxfmt` runs per package, so `AGENTS.md`
   and `.agents/documentation/*` are hand-wrapped to the surrounding style and
   are not covered by `format:check`.

## Handoff

- **D099 reviewers**: judge (a) the README section states the seven checkpoints,
  the catalogue as the only id authority, the `null` / `[]` / exact-token effort
  rule, open vs fixed scope, `inherit`, one-layer merge, and the proof loop;
  (b) the transcript is labelled so wizard speech is not mistaken for command
  output; (c) both orchestrator profiles name `spec-sizing-orchestrator` and
  forbid a guessed model or effort; (d) the authoring skill keeps size an
  authoring decision while moving config generation to `spec-sizing`; (e) the
  skill mirror is byte-identical and the version/CHANGELOG pair is `2.7.0`; (f)
  no live doc still enumerates two prompts.
- **Nothing is blocked.** The next task needs no artifact from this one beyond
  the documented surfaces.
- If a later prompt edit changes the wizard order or wording, the README and the
  skill section are the two places that must follow it.

## Deviations

- **Touched the root `AGENTS.md`.** TASK says "everywhere the shipped spec
  prompts are enumerated"; the root contract was the one live document still
  enumerating two. It is an agent-doc edit, not a behavior change.
- **Added two README items beyond the literal section request:** the `models`
  bullet in the CLI list and the `Catalogue` / `models` entries in the library
  surface. Without them the README's own reference sections stayed wrong after
  D001/D003 added the verb.
- **Regenerated `embedded-payload.generated.ts`.** The packaged skill changed, so
  the embed had to move; `packages/specs test` failed on
  `embedded-payload.test.ts` until it did. This is a generated artifact, not a
  behavior change.
- **No `BOARD.md` broadcast**: this phase has no `BOARD.md`, and this run may
  write only its own `MEMORY.md`.
- **No git commit**, per the worker contract.
