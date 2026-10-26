# Memory

## Context

- Task B001 `prompt-store-rename`: move the prompt store off the retired Pi name.
- Source dir: `.agents/@montflow/pi-prompts/` (4 prompt files).
- Target dir: `.agents/@montflow/prompts/`.
- Out of scope by order: skill names (`montflow-*-pi-*`, B003/B004), skill bodies,
  `packages/specs` (concurrently edited by another worker), historical spec
  records, existing CHANGELOG entries.
- Worktree: `/home/daniel/dev/montflow/spec-optimizations`, branch
  `feat/spec-optimizations`.

## Progress

- `git mv` of all four prompt files done; contents byte-identical (sha256
  before == after, see Findings).
- Path constants and comments updated: `packages/prompts`
  (`prompt-store.services.module.ts`, `prompts.module.ts` comment,
  `prompt-execute.module.ts` diagnostics, `binary.apps.module.ts` description,
  `renderers.apps.module.ts` checked line) and `apps/workspace`
  (`prompts.services.module.ts`, plus the `PANEL_DIRS.prompts` entry in
  `skills.services.module.ts`).
- Tests updated: `prompt-store/tests/read-raw.test.ts`,
  `prompts/tests/verify.test.ts`, `apps/cli/tests/engines.test.ts`.
- Live docs updated: `AGENTS.md`, `apps/workspace/src/services/prompts/CONTEXT.md`,
  `.agents/@montflow/profiles/bookkeeper/PROFILE.md` (store path + `--dir`
  example; table padding re-aligned).
- Stale package-name comments fixed: `oxlint.config.ts`, and the `@param prompt`
  JSDoc in `apps/workspace/src/services/prompts/prompts.services.module.ts`.
- Verification run and recorded (Stage 0): format, lint, typecheck, tests.
- `bun run mf:check:prompts` passes: `4 prompts · 0 issues · 0 warnings`.
- `bun run mf:check:profiles` passes: `11 profiles · 0 issues · 0 warnings`.

## Findings

### Prompt files are byte-identical

sha256 before the move (`.agents/@montflow/pi-prompts/`):

```
a2845fb001581f06b1ad0c90826e2d4b2418e753e68e05bf0583c6d6d5850544  commit.json
782cfb3eb311eb87be104a2caaddfa6af0fdbcf705899a52696172efe9d59aa3  effect-review.json
646c45f731178ab481edcf0933866fc8b2dfa80612048515e54c70c472e70f1a  spec-create.json
c167b3016b0aaf7e1e04322a9695a87596994000d5779dbf61ef344362a5f2fb  spec-execute.json
```

sha256 after the move (`.agents/@montflow/prompts/`): identical four lines.

### The target directory already existed and held a stale fifth file

`.agents/@montflow/prompts/commit.json` (901 B, `version: 1`, no `description`,
no `model`) was tracked since `7494cef chore(agents): add commit prompt config`
and was never read: the live store constant pointed at `pi-prompts`, and no live
doc, test, or code referenced the old `prompts/` directory.

It cannot coexist with the moved store: it declares `name: "commit"`, the same
prompt, and it does not decode as a `Prompt`. Mechanical proof, run with the
legacy bytes alone in a store-shaped tree:

```
$ bun run --cwd packages/prompts cli verify --all --dir "/tmp/opencode/probe2"
commit: ✗ not verified — 1 issue
  json: Not a valid prompt file.
1 prompt · 1 issue · 0 warnings
error: script "cli" exited with code 1
```

It was therefore removed (`git rm`) and replaced by the store's current
`commit.json`; its bytes stay in git history at `7494cef` / `70aa656`.

### Remaining `pi-prompts` hits and why each stays

`grep -rn "pi-prompts" . --exclude-dir=node_modules --exclude-dir=.git -l`
returns only:

1. `.agents/@montflow/specs/<completed specs>/**` — historical spec records
   (`montflow-ci-verification`, `montflow-multi-reviewer`,
   `montflow-opencode-migration`, `montflow-project-structure`,
   `montflow-spec-standard`). Untouched by order.
2. `.agents/@montflow/specs/spec-optimizations/{SPEC,B001,B003,B004,B099}` —
   this phase's own records, owned by the orchestrator.
3. Skill **names** `montflow-create-pi-prompts` / `montflow-execute-pi-prompts`
   in `packages/prompts/scripts/generate-embedded-skills.ts`,
   `apps/doctor/doctor.apps.module.ts`, `embedded-payload.generated.ts`,
   `apps/doctor/tests/run-doctor.test.ts`, `apps/cli/tests/skill-docs.test.ts`,
   `.agents/skills/montflow-*-pi-prompts/**`,
   `packages/prompts/skills/montflow-*-pi-prompts/**`, `README.md`,
   `packages/prompts/README.md`, `apps/workspace/src/services/prompts/CONTEXT.md`
   (line 36), `.agents/@montflow/profiles/bookkeeper/PROFILE.md` (line 10) —
   B003/B004.
4. Skill **bodies** that spell the old store path
   (`packages/prompts/skills/**/SKILL.md`, `.agents/skills/**/SKILL.md`) and the
   generated `embedded-payload.generated.ts` copies — B003 owns the in-skill
   path rewrite plus the version bump, payload regeneration, and mirror sync
   that must accompany it.
5. Existing skill `CHANGELOG.md` entries quoting `@montflow/pi-prompts` —
   historical, not rewritten.

No live path reference to `.agents/@montflow/pi-prompts/` remains in `packages`,
`apps`, or live docs.

### Gate output (verbatim)

`bun run --cwd packages/prompts test`:

```
 Test Files  46 passed (46)
      Tests  559 passed (559)
Type Errors  no errors
```

`bun run --cwd packages/prompts lint:check` → exit 0 (only oxlint
`MODULE_TYPELESS_PACKAGE_JSON` runtime warnings from `tooling/oxlint/`).

`bun run --cwd packages/prompts format:check`:

```
Checking formatting...

All matched files use the correct format.
Finished in 281ms on 70 files using 16 threads.
```

`bun run --cwd packages/prompts ts:check` → `$ tsc --noEmit`, no diagnostics.

`bun run mf:check:prompts`:

```
$ bun run src/apps/cli/main.ts verify --all --dir /home/daniel/dev/montflow/spec-optimizations
4 prompts · 0 issues · 0 warnings
$ bun run src/apps/cli/main.ts doctor --check --dir /home/daniel/dev/montflow/spec-optimizations
✓ prompts skills are installed and up to date.
✓ montflow-create-pi-prompts: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-create-pi-prompts
✓ montflow-execute-pi-prompts: up to date → /home/daniel/dev/montflow/spec-optimizations/.agents/skills/montflow-execute-pi-prompts
```

`bun run --cwd apps/workspace test`:

```
 Test Files  1 failed | 47 passed (48)
      Tests  3 failed | 239 passed (242)
Type Errors  no errors
```

The three failures are `src/services/specs/tests/specs.test.ts` (lines 206,
216, 234) reading `packages/specs/fixtures/`, which carries another worker's
uncommitted sizing work (`git status`: modified `mock-*/**/TASK.md`, new
`fixtures/.agents/@montflow/specs/sizing.json`). No B001 file is on that path.

`bun run --cwd apps/workspace lint:check` → exit 0.
`bun run --cwd apps/workspace format:check` → `All matched files use the correct
format.`
`bun run --cwd apps/workspace ts:check` → `$ tsc --noEmit`, no diagnostics.
`bun run mf:check:profiles` → `11 profiles · 0 issues · 0 warnings`.

## Open Questions

1. **No changelog entry was added.** `packages/prompts` ships no package-level
   `CHANGELOG.md`, and `@montflow/prompts` is in `.changeset/config.json`'s
   `ignore` list, so changesets cannot record it either. The only changelogs are
   the two shipped skills' `CHANGELOG.md`, and their newest entry must equal the
   SKILL.md `version:` (asserted by `apps/cli/tests/skill-docs.test.ts`), so an
   entry there forces a version bump, a payload regeneration, and a mirror sync —
   all steps B003 already owns for the rename. Adding it here would leave a
   changelog claiming a path that the skill body still spells the Pi way.
   Orchestrator: confirm B003 carries the entry, or reassign it.
2. **`Pi` identifiers in the workspace prompts service survive**:
   `PiPromptsLib`, `loadPiPrompts`, `loadedPiPrompts`, `cachedLib`/`liveLib`
   types and their tests. They are extension-runtime names, not the store path,
   and neither B001's nor B004's requirement list names them. Candidate for the
   phase review if the phase really means "no live artifact names Pi".
3. **`.agents/skills/**/SKILL.md` bodies still spell the old store path.** B003
   must land them together with `generate:payload` for `packages/prompts` and
   the `.agents/skills` mirror, otherwise `skill-docs.test.ts` and
   `mf:check:prompts` drift.

## Handoff

- B002: the installed prompt directory is exactly
  `.agents/@montflow/prompts/`, and it currently holds exactly
  `commit.json`, `effect-review.json`, `spec-create.json`, `spec-execute.json`.
  Doctor must own only the latter two and must not touch the other two.
- B003: rename the skills, rewrite the old store path inside both SKILL.md
  bodies, bump versions, regenerate the embedded payload, re-sync
  `.agents/skills/`, and add the changelog entry that records this move.
- B004: README/`packages/prompts/README.md`/`CONTEXT.md`/`PROFILE.md` need only
  the remaining skill-name edits; every store-path mention there is already
  `.agents/@montflow/prompts/`.
- Nothing in B001 needs a follow-up run; the store move itself is complete and
  verified.

## Deviations

1. **Deleted a tracked file at the target path.**
   `.agents/@montflow/prompts/commit.json` (legacy `version: 1` shape, 901 B,
   unreferenced) was removed so the moved store could take the name. Evidence
   above: it fails `verify --all` (`json: Not a valid prompt file`) and would
   have broken `mf:check:prompts`; its bytes remain in git history.
2. **Touched two files outside the literal requirement list.**
   `apps/workspace/src/services/skills/skills.services.module.ts`
   (`PANEL_DIRS.prompts`, a live path constant that would otherwise point at the
   deleted directory) and `oxlint.config.ts` (a live comment naming the retired
   package). Both are one-line, path-only edits with no behavioural risk.
3. **No BOARD.md entry broadcast.** The phase has no `BOARD.md`, and the order
   for this dispatch forbids writing anything but this `MEMORY.md`; items a
   sibling needs are in Handoff above.
4. **No changelog entry** — see Open Question 1.
