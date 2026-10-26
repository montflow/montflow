# Memory

## Context

- Task B003 `skills-rename`: drop the retired `-pi-` infix from eight skills,
  move their installed mirrors, and rename the `packages/profiles` module.
- Worktree `/home/daniel/dev/montflow/spec-optimizations`, branch
  `feat/spec-optimizations`.
- Eight names: `montflow-create-skills`, `montflow-modify-skills`,
  `montflow-create-prompts`, `montflow-execute-prompts`,
  `montflow-create-specs`, `montflow-find-specs`,
  `montflow-create-profiles`, `montflow-modify-profiles`.
- In scope: package skill dirs, frontmatter, cross-references, doctor
  constants, generator scripts, embedded payloads, installed mirrors,
  `pi-profiles` → `profiles` module/namespace, and every import/test/export.
- Out of scope by order: live docs (root/package README, `CLI.md`, `wiki/`),
  `.agents/@montflow/profiles/**` skill arrays, prompt-JSON `skills` arrays,
  and workspace-service legacy identifiers — all B004. Historical changelog
  entries, completed spec records, `SPEC.md`, status, locks, and git commits
  untouched.

## Progress

Done.

### Renames (all via `git mv`, old dirs removed)

Package skills (six dirs, package + `.agents/skills` mirror):

- `packages/skills/skills/montflow-create-skills`
- `packages/skills/skills/montflow-modify-skills`
- `packages/prompts/skills/montflow-create-prompts`
- `packages/prompts/skills/montflow-execute-prompts`
- `packages/specs/skills/montflow-create-specs`
- `packages/specs/skills/montflow-find-specs`

Workspace-only skill mirrors (two dirs; no package copy exists):

- `.agents/skills/montflow-create-profiles`
- `.agents/skills/montflow-modify-profiles`

### Skill content

- Frontmatter `name` updated in all eight.
- Version bumped and a new newest `CHANGELOG.md` entry added in all eight
  (`version:` == newest changelog heading, checked mechanically below).
- Prompt skills now spell the store path `.agents/@montflow/prompts/`; the
  create/execute skills cross-reference each other by their new names.
- Skill/skill cross-references updated: modify-skills → create-skills,
  find-specs → create-specs, create-profiles ↔ modify-profiles (SKILL.md and
  modify-profiles `GATES.md`), and the stale format-source path in
  create-profiles (`packages/profiles/src/modules/profiles/`).
- `authoring-skills` (a generic skill naming the convention) changed its
  platform-tooling rule to `montflow-<verb>-<noun>` with the new examples; it
  also got a version bump and changelog entry because its body changed.

### Code

- `packages/skills`: `SKILL_NAMES`, `GENERATION_REQUIREMENTS`,
  `MODIFICATION_REQUIREMENTS`, `TRANSFORM_REQUIREMENTS`, and the generator's
  `SKILL_NAMES`; tests updated.
- `packages/prompts`: `SKILL_NAMES` + generator `SKILL_NAMES`; skill-docs and
  doctor tests updated; payload regenerated.
- `packages/specs`: `SPEC_SKILL_NAMES` (+ derived `CREATE_SPEC_SKILL_NAME`,
  `FIND_SPECS_SKILL_NAME`), drift test and doctor CONTEXT updated. No embedded
  payload exists in this package.
- `packages/profiles`: `src/modules/pi-profiles/` →
  `src/modules/profiles/`, `pi-profiles.module.ts` → `profiles.module.ts`,
  namespace `PiProfiles` → `Profiles` across exports, imports, tests, and
  requirement constants. The unused legacy `PiProfile` type alias became
  `ProfileDescriptor` (no consumer).
- `packages/reviews`: `review-dispatch.apps.module.ts` imports `Profiles`
  instead of the removed `PiProfiles`.
- `apps/workspace`: profiles service and extension-loader tests use the
  `Profiles` namespace and the new skill names; skills extension-loader test
  expects `montflow-create-skills`.
- Package-internal `CONTEXT.md` files whose paths/constants changed were
  updated (`packages/skills/src/modules/skill`,
  `packages/specs/src/apps/doctor`, `packages/profiles/src/apps/cli`,
  `packages/profiles/src/apps/interactive`, `packages/profiles/src/modules/
  skill-check`, `packages/profiles/src/services/profile-store`,
  `apps/workspace/src/services/profiles`).

### Payload regeneration (own scripts, no hand-edited output)

```
$ bun run --cwd packages/skills generate:payload
$ bun run scripts/generate-embedded-skills.ts
wrote ./src/apps/doctor/embedded-payload.generated.ts — 2 skills, 7473 bytes of payload
$ bun run --cwd packages/prompts generate:payload
$ bun run scripts/generate-embedded-skills.ts
wrote ./src/apps/doctor/embedded-payload.generated.ts — 2 skills, 22888 bytes of payload
```

## Findings

### Directory proof

```
$ find packages/*/skills .agents/skills -mindepth 1 -maxdepth 1 -type d -name '*-pi-*'
(no output)
```

### Live-name proof

Excluding historical changelogs, generated payloads, and the B004-owned docs /
prompt JSON, no live `-pi-` skill name remains:

```
$ grep -rn "montflow-[a-z-]*-pi-[a-z-]*" packages apps .agents/skills \
    --include=*.ts --include=*.md --include=*.json \
  | grep -v CHANGELOG | grep -v embedded-payload.generated.ts \
  | grep -vE "README\.md|/wiki/|CLI\.md|CONTEXT\.md|spec-create\.json|spec-execute\.json"
(no output)
```

Deliberate B004 leftovers still matching the old name (handoff below):

- `apps/workspace/src/services/prompts/CONTEXT.md:36`
- `packages/profiles/CLI.md:70,109,110`
- `packages/prompts/README.md:113,114`
- `packages/skills/README.md:37,38`
- `packages/skills/wiki/package.md:43`
- `packages/specs/README.md:56`
- `packages/specs/prompts/spec-create.json` (skills + template) and
  `spec-execute.json` (skills)
- root `README.md:41-44`

### Mirror equality

```
$ for n in montflow-create-skills montflow-modify-skills montflow-create-prompts \
    montflow-execute-prompts montflow-create-specs montflow-find-specs; do ...
montflow-create-skills byte-identical
montflow-modify-skills byte-identical
montflow-create-prompts byte-identical
montflow-execute-prompts byte-identical
montflow-create-specs byte-identical
montflow-find-specs byte-identical
```

### Version == newest changelog entry

```
montflow-create-skills: version=1.2.0 newest=1.2.0 OK
montflow-modify-skills: version=1.1.0 newest=1.1.0 OK
montflow-create-prompts: version=3.1.0 newest=3.1.0 OK
montflow-execute-prompts: version=3.5.0 newest=3.5.0 OK
montflow-create-specs: version=2.5.0 newest=2.5.0 OK
montflow-find-specs: version=1.4.0 newest=1.4.0 OK
montflow-create-profiles: version=1.3.0 newest=1.3.0 OK
montflow-modify-profiles: version=1.2.0 newest=1.2.0 OK
authoring-skills: version=1.7.0 newest=1.7.0 OK
```

### Gate output (verbatim, final run)

`bun run mf:check:skills` (exit 0):

```
46 skills · 0 issues
✓ skills are installed and up to date.
✓ montflow-create-skills: up to date → .../.agents/skills/montflow-create-skills
✓ montflow-modify-skills: up to date → .../.agents/skills/montflow-modify-skills
```

`bun run mf:check:prompts` (exit 0, three B004 warnings):

```
spec-create: ✓ verified — 2 warnings
  skills: Skill 'montflow-create-pi-specs' is not installed under .../.agents/skills/.
  skills: Skill 'montflow-find-pi-specs' is not installed under .../.agents/skills/.
spec-execute: ✓ verified — 1 warning
  skills: Skill 'montflow-find-pi-specs' is not installed under .../.agents/skills/.
4 prompts · 0 issues · 3 warnings
✓ prompts skills are installed and up to date.
✓ montflow-create-prompts: up to date → .../.agents/skills/montflow-create-prompts
✓ montflow-execute-prompts: up to date → .../.agents/skills/montflow-execute-prompts
```

`bun run mf:check:specs` (exit 0, pre-existing size warnings):

```
6 specs · 0 failed · 0 issues · 79 warnings
✓ spec skills and prompts are installed and up to date.
✓ montflow-create-specs: up to date → .../.agents/skills/montflow-create-specs
✓ montflow-find-specs: up to date → .../.agents/skills/montflow-find-specs
✓ spec-create: up to date → .../.agents/@montflow/prompts/spec-create.json
✓ spec-execute: up to date → .../.agents/@montflow/prompts/spec-execute.json
```

`bun run mf:check:profiles` (exit 0, 15 B004 warnings):

```
11 profiles · 0 issues · 15 warnings
```

`bun run mf:check:reviews` (exit 0, because `packages/reviews` was touched):

```
4 files · 0 issues
✓ review skills are installed and up to date.
```

Tests (final, after formatting):

```
packages/skills    Test Files  40 passed (40)   Tests  243 passed (243)  Type Errors  no errors
packages/prompts   Test Files  46 passed (46)   Tests  559 passed (559)  Type Errors  no errors
packages/specs     Test Files  70 passed (70)   Tests  704 passed (704)  Type Errors  no errors
packages/profiles  Test Files  26 passed (26)   Tests  144 passed (144)  Type Errors  no errors
packages/reviews   Test Files  24 passed (24)   Tests  160 passed (160)  Type Errors  no errors
apps/workspace     Test Files  48 passed (48)   Tests  242 passed (242)  Type Errors  no errors
```

`format:check` (all six packages): exit 0,
`All matched files use the correct format.`

`lint:check` (all six packages): exit 0, `Found 0 warnings and 0 errors.` for
the turbo-filtered run; the package-scoped runs also exit 0.

`ts:check` (all six packages): exit 0, `$ tsc --noEmit`, no diagnostics.

`turbo lint:check --filter=@montflow/skills --filter=@montflow/prompts --filter=@montflow/specs`:

```
 Tasks:    3 successful, 3 total
Cached:    0 cached, 3 total
```

## Open Questions

1. **B004 owns the remaining warnings.** `mf:check:prompts` has 3 warnings and
   `mf:check:profiles` has 15 because prompt JSON `skills` arrays and
   `.agents/@montflow/profiles/**` still name the old skills. B003 was
   forbidden prompt-JSON and profile edits, so these are handed off, not
   missed.
2. **Workspace legacy identifiers remain.** `apps/workspace` still names its
   local lazily-loaded runtime handle `PiProfilesLib` / `loadPiProfiles` /
   `loadedPiProfiles`; only the imported namespace and test assertions were
   changed. Same class of leftover as B001's `PiPromptsLib`, best decided in
   B004 or phase review.
3. **`PiProfile` alias became `ProfileDescriptor`.** The old type alias had no
   consumers. If a reviewer prefers deleting it outright or keeping the name
   `Profile`, that is a one-line change.
4. **Non-skill `pi-` strings left untouched:** temp-dir prefixes
   `pi-skills-store-` (`packages/skills/src/modules/skill-store/tests/list.test.ts`)
   and `/tmp/pi-specs-definitely-missing`
   (`packages/specs/src/services/spec-store/tests/spec-store.test.ts`). They are
   not skill names.

## Handoff

- **B004**: update the prompt-JSON `skills` arrays and templates
  (`packages/specs/prompts/spec-create.json`, `spec-execute.json`), then run
  `bun run --cwd packages/specs cli doctor --dir "$PWD"` to refresh
  `.agents/@montflow/prompts/`. Rename the skill arrays in
  `.agents/@montflow/profiles/**`. Update root/package README, `CLI.md`,
  `wiki/`, and `apps/workspace/src/services/prompts/CONTEXT.md`. Rerun
  `mf:check:prompts` and `mf:check:profiles`; both should reach zero warnings.
- **Reviewers**: judge (a) the eight dirs and frontmatter `name`s match the
  new list, (b) mirrors are byte-identical and old dirs are gone, (c) payload
  equality tests pass, (d) namespace `Profiles` has no `PiProfiles` consumers
  anywhere in `packages`/`apps`, (e) historical changelog entries were not
  rewritten.
- **Nothing else needed from B003**; all gates above were run on the final
  tree.

## Deviations

1. **Touched `packages/reviews`** (outside the expected package list) because
   `review-dispatch.apps.module.ts` imported the removed `PiProfiles`
   namespace; the workspace typecheck failed until it followed.
2. **Touched `apps/workspace` services/tests** for the namespace rename and
   the two requirement constants. Broader workspace legacy names were left for
   B004 on purpose.
3. **Updated package-internal `CONTEXT.md` files** whose module paths or
   constants this task renamed, and `authoring-skills` (a skill cross-reference
   plus its convention text) with a version bump. Broad live docs were left to
   B004.
4. **Removed the `PiProfile` type alias in favour of `ProfileDescriptor`.**
   Unused export; part of retiring the Pi namespace.
5. **Ran the TASK's literal `turbo lint:check --filter=...` via `bunx`.** The
   repo rule prefers package scripts, so the same check was also run
   package-scoped (`bun run --cwd <pkg> lint:check`) for all six packages.
6. **No `BOARD.md` broadcast and no git commit** — the phase has no board and
   the dispatch limits writes to this `MEMORY.md`.
