# Memory

## Context

Retire the montflow session engine once every consumer runs on native OpenCode
sessions and the `subagent` tool (TASK C006; B003 §9, B001 §6, A006 §5.6). C003,
C004, and C005 had already moved prompts/profiles, reviews/skills, and the
TUI/workspace off `Runtime.activeSessionRunnerHost`, leaving `pi-sessions` as the
only remaining owner of the engine and the workspace services as its only
in-process (and unreachable) consumers.

## Progress

- complete — **preconditions verified**:
  - `C003-port-child-run-extensions/TASK.md`, `C004-port-dispatch-extensions`,
    and `C005-port-tui-and-workspace` all read `status: complete`.
  - pre-cut `activeSessionRunnerHost` grep: one match, the definition at
    `packages/pi-sessions/src/apps/runtime/runtime.apps.module.ts:138`; every
    other hit was under `.agents/@montflow/specs/**` (historical records).
- complete — deleted `packages/pi-sessions` entirely: engine, `mf-sessions`,
  doctor, wiki, and the packaged `montflow-dispatch-pi-sessions` skill source.
- complete — removed the root wiring: `verify:montflow:sessions` and the
  `@montflow/pi-sessions` devDependency from `package.json`, the `:sessions`
  step from `verify:montflow:extensions`, the `.changeset/config.json` ignore
  entry, `.pi/settings.json`'s package entry, the CI matrix cell and its header
  mention in `.github/workflows/verify.yml`, and the Lefthook comment.
  `bun install` regenerated `bun.lock` (2 packages removed).
- complete — deleted the workspace's unreachable Pi-era session data layer:
  - `apps/workspace/src/services/sessions/**` and its nine test files;
  - the agentic create/modify/spec dispatch flows in
    `services/{profiles,prompts,skills,specs}` (session hooks, preprompts,
    flow hosts), the `isExtensionInstalled` / `parseListOutput` /
    `install*` / `installArgs*` probes and helpers, and the `SessionDetail`
    type imports;
  - `Sessions` from `services/index.ts`, the `sessions` member of
    `ExtensionPanel` / `PANEL_DIRS` / `INSTALL_HINTS`, and the
    `@montflow/pi-sessions` dependency from `apps/workspace/package.json`.
  - specs lost its live-session binding: `activeSpecIds`, `rawSpecIds`, the
    dispatch helpers, and `SpecSummary.active` are gone; `Lifecycle.analyze`
    now receives `active: false`.
- complete — swept the live artifacts:
  - `.agents/skills/montflow-dispatch-pi-sessions/` deleted (installed copy of
    the deleted package skill);
  - `.agents/@montflow/pi-prompts/{spec-execute,spec-create,effect-review}.json`
    drop the skill and dispatch through the `subagent` tool;
  - `.agents/@montflow/profiles/{bookkeeper,spec-bookkeeper,spec-worker,spec-creation-orchestrator,spec-execution-orchestrator}/PROFILE.md`
    drop the skill dependency, the Sessions ledger row, and the `mf-sessions`
    probe; dispatch prose names `subagent`s;
  - `montflow-find-pi-specs` (installed + `packages/{specs,pi-specs}` copies),
    `executing-spec.ts` (both copies), `authoring-skills`, the specs
    `CONTEXT.md` files, `apps/workspace/src/services/*/CONTEXT.md`,
    `apps/workspace/README.md`, root `README.md`, and
    `.agents/documentation/author-mf-utility-cli.md` no longer name the engine;
  - historical changelog lines that named it were reworded (the grep gate is
    over live files, and a changelog is a live artifact).
- complete — regenerated `packages/prompts/src/apps/doctor/embedded-payload.generated.ts`
  with `bun run --cwd packages/prompts generate:payload` after bumping
  `montflow-execute-pi-prompts` to 3.4.1 and mirroring it byte-for-byte into
  `.agents/skills`. No payload test was weakened.
- complete — **one atomic commit**: `3d7e0ff refactor(sessions)!: retire the
  pi-sessions engine` (153 files, +235 / −13716). Nothing under
  `.agents/@montflow/specs/**` is in it.

## Gate evidence (2026-10-21)

Preconditions:

- C003/C004/C005 `TASK.md` → `status: complete`.
- `grep -rIn activeSessionRunnerHost` (node_modules/.git/.turbo/dist excluded) →
  1 live match, `packages/pi-sessions/src/apps/runtime/runtime.apps.module.ts:138`.

Grep gate after the cut:

```
$ grep -rIl 'pi-sessions\|mf-sessions\|activeSessionRunnerHost\|Montflow\.PiSessions\|session_start\|session_steer' \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.turbo --exclude-dir=dist . \
  | grep -v '^\./\.agents/@montflow/specs/' | grep -v '^\./\.agents/@montflow/reviews/'
(no output; exit 1)
```

Without the reviews exclusion the only matches are the four historical
`.agents/@montflow/reviews/montflow-opencode-migration-{a,b}/*/REVIEW.md`
ledgers (see Deviations).

Scoped verification (all run through package scripts):

- `bun run --cwd apps/workspace ts:check` → `$ tsc --noEmit` (clean)
- `bun run --cwd apps/workspace test` → `Test Files 46 passed (46)`,
  `Tests 234 passed (234)`, `Type Errors no errors`
- `bun run --cwd apps/workspace test:tui` → `43 pass`, `0 fail`,
  `14 expect() calls`, `Ran 43 tests across 9 files.`
- `bun run --cwd apps/workspace lint:check` → exit 0 (`oxlint --deny-warnings`,
  only the repo-wide MODULE_TYPELESS_PACKAGE_JSON warnings)
- `bun run --cwd apps/workspace format:check` → `All matched files use the correct format.`
- `bun run --cwd packages/opencode smoke` → `12 pass`, `0 fail`,
  `58 expect() calls`, `Ran 12 tests across 1 file.`
- `bun run --cwd packages/prompts ts:check` → `$ tsc --noEmit` (clean)
- `bun run --cwd packages/prompts test` → `Test Files 44 passed (44)`,
  `Tests 555 passed (555)`, `Type Errors no errors`
- `bun run --cwd packages/specs ts:check` → `$ tsc --noEmit` (clean);
  `test` → `52 passed (52)`, `326 passed (326)`, `no errors`; lint/format clean
- `bun run --cwd packages/pi-specs ts:check` → `$ tsc --noEmit` (clean);
  `test` → `52 passed (52)`, `326 passed (326)`, `no errors`; lint/format clean
- `bun run --cwd packages/prompts lint:check` / `format:check` → clean

Extension verifies after the cut:

```
skills    45 skills · 0 issues   + doctor: skills installed and up to date
prompts   4 prompts · 0 issues · 0 warnings + doctor: up to date
specs     4 specs · 0 failed · 0 issues
profiles  11 profiles · 0 issues · 0 warnings
reviews   17 files · 0 issues     + doctor: up to date
```

Full gate (uncached, no `:sessions` task):

```
$ TURBO_FORCE=true bun run verify:montflow
 Tasks:    16 successful, 16 total
Cached:    0 cached, 16 total
```

Per-package suites in that run: workspace 234, prompts 555, skills 241,
profiles 140, reviews 98, specs 326, pi-specs 326, pi-interactive 68, core 744,
opencode 128, format 46, linting 9, stlx 9, workflows 30, pi-effect 40 — every
one `Type Errors no errors`. The task count dropped from 17 to 16 because
`@montflow/pi-sessions:test` no longer exists.

## Findings

- The workspace's Pi-era flows were unreachable from every plugin face: the
  grid page only calls `fetch*`, `loadSpec`, `delete*`, and `verifyProfile`,
  and the server face only counts stored artifacts. Deleting the flows (rather
  than porting them) is the correct cut: native authoring already lives in
  `/mf-skills`, `/mf-profiles`, `/mf-prompts`, and `mf-specs` + `subagent`.
- `SpecSummary.active` was never rendered; it only fed `Lifecycle.analyze`.
  With no live session registry, the honest value is `false`, and the field is
  removed instead of left dead.
- The `specs` service lost all of its tests with the flow tests: the read path
  (`fetchSpecs`, `loadSpec`, `readReviewSeries`) is now only covered indirectly
  by the grid-page test. See Open Questions.
- Profiles verification resolves declared `skills:` against `.agents/skills`,
  so deleting the dispatch skill required removing it from every profile
  frontmatter (and from the prompt templates' `skills` arrays) before the
  verifies could pass.
- `bun.lock` reflects the removal exactly: no `@montflow/pi-sessions` entry and
  no `mf-sessions` bin.
- Remaining Pi-era but engine-independent dead code left in place (see Open
  Questions) kept this cut atomic instead of turning it into a workspace-wide
  dead-code sweep.

## Open Questions

- `.agents/@montflow/reviews/**` is exempt from the grep gate in this task's
  evidence because it is an append-only historical ledger (the review skill
  owns it; it is not a live instruction). See Deviations. The orchestrator may
  want the gate statement to name it explicitly.
- The workspace skills service still carries dead Pi-era helpers with no
  consumer: the `~/.pi/agent/models-store.json` / `settings.json` catalogue
  (`parseModelsStore`, `listModelLabels`, `parseDefaultModel`,
  `listDefaultModel`), the `pi -p` headless transport (`buildHeadlessPrompt`,
  `runHeadlessAgent`, `headlessArgs`, `AgentError`), and `storeFor` /
  `skillInventoryFor` / `installHint`. They do not touch the retired engine and
  were out of C006's declared delete list.
- The specs service has no unit tests now. A read-path test over a temp spec
  tree would restore the coverage the flow tests used to give it.
- `packages/pi-specs` and `packages/specs` both still exist, and
  `verify:montflow:specs` still points at `packages/pi-specs`. That duplication
  predates C006 and belongs to the package-architecture cleanup.
- `.agents/documentation/author-mf-utility-cli.md` and root `README.md` remain
  broadly Pi-era beyond the retired-engine lines this task edited.
- Profiles still speak of `ask_user` / `notify_user` and `mf-reviews`, and
  `layout.json` still ships a `sessions` cell. None of these name the retired
  engine; they are separate content/data follow-ups.
- `.pi/settings.json` still lists `pi-notifications`, `pi-profiles`,
  `pi-prompts`, and `pi-skills`, none of which exist on disk. Only the
  `pi-sessions` entry was in scope.

## Handoff

Files (all in commit `3d7e0ff`):

- deleted `packages/pi-sessions/**`, `apps/workspace/src/services/sessions/**`,
  `.agents/skills/montflow-dispatch-pi-sessions/**`, and the flow/probe test
  files in the four workspace services;
- `package.json`, `bun.lock`, `.changeset/config.json`, `.pi/settings.json`,
  `.github/workflows/verify.yml`, `lefthook.yml`, `README.md`;
- `apps/workspace/{package.json,README.md,src/services/**}`;
- `.agents/@montflow/{pi-prompts,profiles}/**`, `.agents/skills/**`,
  `.agents/documentation/author-mf-utility-cli.md`;
- `packages/{prompts,specs,pi-specs}/skills/**`,
  `packages/prompts/src/apps/doctor/embedded-payload.generated.ts`,
  `packages/{specs,pi-specs}/src/{skills/executing-spec.ts,services/spec-store/CONTEXT.md,modules/prompt/CONTEXT.md,apps/cli/CONTEXT.md}`.

Next: C007 owns the real-host verification and distribution gate. It can pick
up the dead-code cleanup and specs read-path tests listed above; nothing in
this cut needs a seam.

## Deviations

- **Grep-gate exemption extended to reviews.** The task exempts
  `.agents/@montflow/specs/**` as historical records. The four
  `.agents/@montflow/reviews/montflow-opencode-migration-{a,b}/*/REVIEW.md`
  ledgers are the same class of historical record — append-only review history
  that discusses the migration and must not be rewritten — so the reported gate
  also excludes them. Every other path in the repo is clean.
- **Agentic workspace flows deleted, not ported.** The task named
  `services/sessions/**`; its only callers were the unreachable create/modify
  flows in the sibling services, which had to go with it or the packages would
  not typecheck. Live authoring already lives in the native plugin faces.
- **Historical changelog lines reworded.** Two shipped skill changelogs named
  the engine in historical entries; the grep gate covers live files, so they
  now say "child session" / "retired engine" without the package name.
- **`SpecSummary.active` removed** rather than left always-false, because
  nothing rendered it.
