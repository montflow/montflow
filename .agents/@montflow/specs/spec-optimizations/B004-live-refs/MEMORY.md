# Memory

## Context

- Task B004 `live-refs`: finish the Phase B rename in every *live* reference.
  B001 moved the prompt store, B002 taught `mf-specs doctor` to sync it, and B003
  renamed the eight skills and the `packages/profiles` module. B004 owns what
  still *names* the old things: prompt JSON `skills` arrays, profile frontmatter
  and prose, live docs, and workspace service identifiers.
- Worktree `/home/daniel/dev/montflow/spec-optimizations`, branch
  `feat/spec-optimizations`.
- In scope: `packages/specs/prompts/*.json` plus its installed copies under
  `.agents/@montflow/prompts/`, `.agents/@montflow/profiles/**/PROFILE.md`, root
  and package README/CONTEXT/CLI/wiki docs, workspace service loaders and their
  tests, and any remaining live `pi-prompts` / `-pi-` / `pi-profiles` token.
- Out of scope: `SPEC.md`, task status, locks, git commits, historical
  `CHANGELOG.md` entries, records of completed specs, and other tasks' records.
- TASK.md requirements 1–2 (rename the two workspace-only profile skills and the
  `pi-profiles` module) were already completed by B003; this task did the
  remaining live references, plus the still-stale docs and identifiers.

## Progress

Done. Files touched by this task:

**Prompt store (canonical + installed, byte-identical)**

- `packages/specs/prompts/spec-create.json` — `skills` array and the template's
  “Load `montflow-create-specs`” line.
- `packages/specs/prompts/spec-execute.json` — `skills` array.
- `.agents/@montflow/prompts/spec-create.json`, `spec-execute.json` — refreshed
  by `bun run --cwd packages/specs cli doctor --dir "$PWD"` (never hand-edited).

**Profiles**

- `.agents/@montflow/profiles/bookkeeper/PROFILE.md` — seven frontmatter skills
  and the artifact-ledger `Repair skill` column.
- `.agents/@montflow/profiles/spec-bookkeeper/PROFILE.md` — three skills.
- `.agents/@montflow/profiles/spec-appraiser/PROFILE.md` — two skills + prose.
- `.agents/@montflow/profiles/spec-execution-orchestrator/PROFILE.md` — one skill.
- `.agents/@montflow/profiles/spec-creation-orchestrator/PROFILE.md` — two skills
  + prose.

**Live docs**

- `README.md` — extension-bound skill map.
- `packages/skills/README.md`, `packages/skills/wiki/package.md`.
- `packages/prompts/README.md`.
- `packages/specs/README.md` — doctor bullet's two skill names.
- `packages/profiles/CLI.md` — `--skills` example and standards path.
- `packages/profiles/README.md` — `PiProfiles` → `Profiles` namespace.
- `apps/workspace/src/services/prompts/CONTEXT.md` — loader name, store path, and
  the two skill names.
- `apps/workspace/src/services/profiles/CONTEXT.md`,
  `apps/workspace/src/services/skills/CONTEXT.md` — loader names.
- `apps/workspace/src/services/git-info/CONTEXT.md` — `@montflow/pi-workspace`
  → the local workspace module.
- `packages/prompts/src/apps/interactive/CONTEXT.md` — `PiEffect.registerCommandEffect`
  → the live `ports.command.register` seam in `server.ts`.
- `packages/reviews/src/apps/cli/renderers.apps.module.ts` — live comment
  “other pi-* CLIs” → “other `mf-*` CLIs”.

**Identifiers**

- `packages/specs/src/index.ts` — `export * as PiSpecs` → `Specs`.
- `packages/profiles/src/modules/skill-check/skill-check.module.ts` —
  `PiSkillsLib` → `SkillsLib`.
- `apps/workspace/src/services/prompts/**` — `PiPromptsLib` → `PromptsLib`,
  `loadPiPrompts` → `loadPrompts`, `loadedPiPrompts` → `loadedPrompts`.
- `apps/workspace/src/services/profiles/**` — same pattern with `Profiles`.
- `apps/workspace/src/services/skills/**` — same pattern with `Skills`.
- `apps/workspace/src/services/*/tests/extension-loader.test.ts` — call sites
  follow the renamed exports.
- `packages/skills/src/modules/skill-store/tests/list.test.ts` — temp-dir prefix
  `pi-skills-store-` → `skills-store-`.
- `packages/specs/src/services/spec-store/tests/spec-store.test.ts` —
  `/tmp/pi-specs-definitely-missing` → `/tmp/specs-definitely-missing`.

## Findings

### Prompt warning/error baseline is gone

Before this task the two prompt files named installed-nowhere skills; after the
edit and doctor sync:

```
$ bun run mf:check:prompts
4 prompts · 0 issues · 0 warnings
✓ prompts skills are installed and up to date.
✓ montflow-create-prompts: up to date → .../.agents/skills/montflow-create-prompts
✓ montflow-execute-prompts: up to date → .../.agents/skills/montflow-execute-prompts
```

```
$ bun run mf:check:profiles
11 profiles · 0 issues · 0 warnings
```

The 15 profile warnings B003 recorded (old skill names in frontmatter) are
cleared.

### Canonical and installed prompts are byte-identical

```
$ sha256sum packages/specs/prompts/spec-create.json .agents/@montflow/prompts/spec-create.json \
    packages/specs/prompts/spec-execute.json .agents/@montflow/prompts/spec-execute.json
7b9919373145d6bf43acf83991361c177a77e81ca556e9bd6fd4e7c61e26a6f6  packages/specs/prompts/spec-create.json
7b9919373145d6bf43acf83991361c177a77e81ca556e9bd6fd4e7c61e26a6f6  .agents/@montflow/prompts/spec-create.json
066a388de1b2880a456b5e3bf44da7f5ec5cf40a5d15db0b6f19a71c86028c9a  packages/specs/prompts/spec-execute.json
066a388de1b2880a456b5e3bf44da7f5ec5cf40a5d15db0b6f19a71c86028c9a  .agents/@montflow/prompts/spec-execute.json

$ cmp packages/specs/prompts/spec-create.json .agents/@montflow/prompts/spec-create.json
create identical
$ cmp packages/specs/prompts/spec-execute.json .agents/@montflow/prompts/spec-execute.json
execute identical
```

The template and arrays now read:

```
"skills": [
  "executing-skills",
  "montflow-create-specs",
  "montflow-find-specs",
  "grilling",
  "i-have-adhd"
]
```

### Grep proof — only history and changelogs remain

Live tree, excluding historical records, changelogs, and generated payloads:

```
$ grep -rn "pi-prompts\|pi-specs\|pi-skills\|pi-profiles" packages apps .agents \
    --exclude-dir=node_modules \
  | grep -vE "CHANGELOG\.md|embedded-payload\.generated\.ts|^\.agents/@montflow/specs/"
(no output; grep exit 1)
```

The full TASK.md grep now returns only these classes:

```
.agents/@montflow/specs/**                                  (historical + this phase's records)
.agents/skills/*/CHANGELOG.md                              (historical entries)
packages/{prompts,skills,specs,reviews}/skills/*/CHANGELOG.md (historical entries)
packages/{prompts,skills,reviews}/src/apps/doctor/embedded-payload.generated.ts
                                                            (generated copies of those changelogs)
```

A token-level scan of live docs and code (`packages`, `apps`, `.agents/skills`,
`.agents/@montflow/profiles`, `.agents/@montflow/prompts`,
`.agents/documentation`) finds only `pi-subagents`, the name of a third-party
reference repo in `finding-references/SKILL.md`; no `@montflow/pi-*` package
reference remains.

### `Pi` identifiers that deliberately survive

- `PiDefaults` in `apps/workspace/src/services/skills/skills.services.module.ts`
  describes the retired `~/.pi/agent/settings.json` file shape; it is a real
  historical file format, not our naming. Its parsers are already `@deprecated`.
- `~/.pi/agent/*` path strings in the same service and its CONTEXT.md name the
  retired host's files.
- Pi-the-host prose in several package CONTEXT/wiki pages (“Pi slash command”,
  “Pi loads `.ts` directly”) is architectural history, not an artifact name.

`PiEffect.registerCommandEffect` was the one stale *live* mention with no
remaining code behind it, so it was replaced with the real seam.

### Gate output (verbatim, final tree)

`bun run mf:check` (exit 0):

```
46 skills · 0 issues
4 prompts · 0 issues · 0 warnings
6 specs · 0 failed · 0 issues · 79 warnings
11 profiles · 0 issues · 0 warnings
4 files · 0 issues
```

The 79 spec warnings are the pre-existing `size: Completed task declares no
size` advisories on historical specs; zero errors, zero failed specs.

`bun run mf:gate:fast` (exit 0):

```
 Tasks:    13 successful, 13 total   (lint)
 Tasks:    13 successful, 13 total   (format)
 Tasks:    13 successful, 13 total   (ts)
46 skills · 0 issues
4 prompts · 0 issues · 0 warnings
6 specs · 0 failed · 0 issues · 79 warnings
11 profiles · 0 issues · 0 warnings
4 files · 0 issues
```

Lint (all packages, from the gate run):

```
@montflow/specs:lint:check: Found 0 warnings and 0 errors.
@montflow/skills:lint:check: Found 0 warnings and 0 errors.
@montflow/prompts:lint:check: Found 0 warnings and 0 errors.
@montflow/profiles:lint:check: Found 0 warnings and 0 errors.
@montflow/reviews:lint:check: Found 0 warnings and 0 errors.
@montflow/workspace:lint:check: Found 0 warnings and 0 errors.
```

(`@montflow/core:lint:check: Found 133 warnings and 0 errors.` is pre-existing;
`core` was not touched.)

Format (all packages, from the gate run):

```
All matched files use the correct format.
```

Typecheck (all packages):

```
$ tsc --noEmit
```

Package-scoped format/ts runs for the six touched packages also exit 0:

```
packages/specs    format: 142 files OK   ts: $ tsc --noEmit
packages/prompts  format:  70 files OK   ts: $ tsc --noEmit
packages/profiles format:  45 files OK   ts: $ tsc --noEmit
packages/skills   format:  62 files OK   ts: $ tsc --noEmit
packages/reviews  format:  46 files OK   ts: $ tsc --noEmit
apps/workspace    format:  93 files OK   ts: $ tsc --noEmit
```

Package tests (final tree):

```
packages/specs     Test Files  70 passed (70)   Tests  704 passed (704)  Type Errors  no errors
packages/prompts   Test Files  46 passed (46)   Tests  559 passed (559)  Type Errors  no errors
packages/profiles  Test Files  26 passed (26)   Tests  144 passed (144)  Type Errors  no errors
packages/skills    Test Files  40 passed (40)   Tests  243 passed (243)  Type Errors  no errors
packages/reviews   Test Files  24 passed (24)   Tests  160 passed (160)  Type Errors  no errors
apps/workspace     Test Files  48 passed (48)   Tests  242 passed (242)  Type Errors  no errors
```

## Open Questions

1. **Pi-the-host prose is untouched.** Package CONTEXT/wiki pages still say “Pi
   slash command”, “Pi loads `.ts` directly”, and name `~/.pi/agent/*` files.
   They are history of the host, not artifact names, and no requirement here
   names them. If the phase review reads “no live artifact names Pi” literally,
   that is a separate, larger doc pass.
2. **`PiDefaults` survives on purpose** (the retired settings-file schema).
   Deleting it would also delete the deprecated parsers and their tests; that is
   a cleanup decision, not a rename.
3. **Bookkeeper table padding is one column short** after the shorter skill
   names in the `Repair skill` column. It renders correctly as Markdown and no
   verifier checks alignment; re-padding it is cosmetic only.

## Handoff

- **B099 reviewer**: judge (a) both prompt JSONs and their installed copies are
  byte-identical and name only new skills, (b) no live artifact outside
  `.agents/@montflow/specs/**` and `CHANGELOG.md` files names the old skills,
  store path, or `pi-profiles` module, (c) the workspace service loaders are
  `loadPrompts` / `loadProfiles` / `loadSkills` with matching tests, (d) no
  historical changelog entry was rewritten.
- **C005 / later docs**: the prompt store is `.agents/@montflow/prompts/`; the
  skill names are the eight `montflow-*` names with no `-pi-` infix; the
  profiles namespace is `Profiles`, the specs namespace is now `Specs`.
- **D002**: add `spec-sizing` to `SPEC_PROMPT_NAMES`; nothing in this task's
  changes affects that path.

## Deviations

1. **TASK.md items 1–2 were already done by B003** (the two profile skills and
   the `pi-profiles` module). They were verified, not redone.
2. **Renamed identifiers beyond the literal dispatch list** — `PiProfilesLib` /
   `loadPiProfiles`, `PiSkillsLib` / `loadPiSkills`, and the `PiSpecs` export —
   so every workspace loader follows the already-renamed specs service
   (`loadSpecs` / `SpecsLib`). This matches SPEC requirement 88 (“workspace
   services lose the legacy names”) and D001's recorded convention.
3. **Renamed two test-only temp-dir strings** (`pi-skills-store-`,
   `/tmp/pi-specs-definitely-missing`) so the TASK.md grep proof really returns
   only historical records.
4. **Fixed two extra stale live docs** (`@montflow/pi-workspace` in
   `git-info/CONTEXT.md`, `PiEffect` in the prompts interactive `CONTEXT.md`)
   because they named removed packages and were in the live-doc scope.
5. **No `BOARD.md` broadcast and no git commit** — the dispatch limits writes to
   this `MEMORY.md`; sibling-relevant facts are in Handoff.
