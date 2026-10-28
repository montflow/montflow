# Memory

## Context

- Task: **C001 — scaffold-package-and-store** (execution, gated), spec
  `montflow-references-plugin`, in-place workspace at
  `/home/daniel/dev/montflow/reference-plugin`, branch `feat/reference-plugin`,
  HEAD `a94972e`.
- Binding rules read: `.agents/@montflow/profiles/spec-worker/PROFILE.md`
  (1–53). Task read: `.../C001-scaffold-package-and-store/TASK.md` (1–36) and
  `GATES.md` (1–12). Spec read: `SPEC.md` (1–101; requirements 51–73
  authoritative, phase E in force for the scoped-invocation wording).
- Phase B decisions consumed: `B001` (store contract: entry path, frontmatter
  fields, derived clone path, issue classes, duplicate policy),
  `B002` (git lifecycle: clone argv, ref resolution, rollback),
  `B003` (verb set, flags, output modes, server/tools, doctor scope, the two
  skills, `@montflow/skills` as a runtime dependency).
- Phase A anatomy consumed: `A002` §1–§8 (manifest skeleton, byte-identical
  tsconfig, vitest config, source layout, CLI layering, payload/doctor, pack
  discovery, copy/adapt table) and its C001 handoff (§Handoff, lines 654–656).
- Live models re-read rather than trusted: `packages/reviews` (manifest,
  tsconfig, vitest, `index.ts`/`apps`/`modules`/`services` barrels, CLI
  `index`/`engines`/`renderers`/`binary`/`slash`/`main`, `server.ts`, `tui.ts`,
  README), `packages/skills` (`index.ts`, `server.ts`, `tui.ts`,
  `modules/index.ts`, `apps/index.ts`), `packages/profiles` (manifest with
  `@montflow/skills`, no payload), `packages/specs/src/server.ts` (minimum
  server), `tooling/pack/src/modules/pack/pack.module.ts`,
  `packages/opencode/src/modules/ports/plugin-entry/plugin-entry.module.ts`.
- Scope executed: `packages/references/`, `bun.lock`, this file. No root
  `package.json`, no CI, no docs, no skills, no other package, no spec state.
- Work-order sources that still do not exist: no `PHASE.md`, no `BOARD.md`, no
  per-task `MAILBOX.md` in the spec directory. Same gap A001/A002/A003/B001/
  B002/B003 recorded; nothing was broadcast (see Deviations).

## Progress

Done, in order:

1. Read the profile, `TASK.md`, `GATES.md`, `SPEC.md`, the three phase-B
   memories, and A002; then re-read the live sibling packages and the packer.
2. Created the package skeleton: `package.json`, `tsconfig.json`,
   `vitest.config.ts`, `README.md`.
3. Created the five entry files (`src/index.ts`, `src/modules/index.ts`,
   `src/apps/index.ts`, `src/server.ts`, `src/tui.ts`) with the
   `@montflow/skills` / `@montflow/reviews` entry shape.
4. Created the `src/modules` group: `reference`, `verifier`, `git` barrels plus
   typed stubs; the `src/services/reference-store` barrel plus failure type;
   the CLI and doctor app barrels plus typed stubs.
5. Registered the workspace with `bun install` (lockfile-only change).
6. Ran every `GATES.md` stage plus `lint:check` and `format:check`; recorded the
   exact output in Findings §6.
7. Wrote this file. No product behaviour, no verb, no store entry, no skill, no
   root script, no CI cell.

## Findings

### 1. Files created (23 files + README + manifest)

```
packages/references/package.json
packages/references/tsconfig.json
packages/references/vitest.config.ts
packages/references/README.md
packages/references/src/index.ts
packages/references/src/server.ts
packages/references/src/tui.ts
packages/references/src/apps/index.ts
packages/references/src/apps/cli/index.ts
packages/references/src/apps/cli/binary.apps.module.ts
packages/references/src/apps/cli/engines.apps.module.ts
packages/references/src/apps/cli/renderers.apps.module.ts
packages/references/src/apps/cli/slash.apps.module.ts
packages/references/src/apps/cli/main.ts
packages/references/src/apps/doctor/index.ts
packages/references/src/apps/doctor/doctor.apps.module.ts
packages/references/src/modules/index.ts
packages/references/src/modules/reference/{index,reference.module}.ts
packages/references/src/modules/verifier/{index,verifier.module}.ts
packages/references/src/modules/git/{index,git.module}.ts
packages/references/src/services/index.ts
packages/references/src/services/reference-store/{index,reference-store.services.module}.ts
packages/references/src/tests/entry.test.ts
```

Manifest is `packages/reviews/package.json` with names swapped:

- `@montflow/references`, `0.0.1`, `private: true`, `type: module`,
  `bin.mf-references -> ./src/apps/cli/main.ts`.
- `exports`: `./package.json`, `.` → `src/index.ts`, `./server` →
  `src/server.ts`, `./tui` → `src/tui.ts` (all three exist, checked with `ls`).
- `repository.directory: packages/references`; `keywords: [effect,
  references]`; MIT; author Daniel Montilla; same `bugs` URL as siblings.
- Scripts: `cli`, `build:cli`, `generate:payload`, `format:check`,
  `format:fix`, `lint:check`, `lint:fix`, `test`, `ts:check` — same names and
  commands as `reviews`/`skills`/`prompts`.
- `dependencies`: `@effect/platform-node@4.0.0-rc.112`,
  `@montflow/opencode@workspace:*`, `@montflow/skills@workspace:*` (the last one
  is B003 §12's ruling for the doctor/verify skill-standard check; unused until
  C002/C006).
- `devDependencies`: the identical seven sibling entries; `peerDependencies`
  pins `effect@4.0.0-rc.112`.

`build:cli` compiles only (the `profiles` form) because the payload generator
and `skills/` do not exist yet; `generate:payload` is declared and points at
`scripts/generate-embedded-skills.ts`, which C006 adds and prepends to
`build:cli` (see Open Questions 3).

### 2. Stub inventory — types and constants only

- `modules/reference/reference.module.ts`: `STORE_DIR =
  '.agents/@montflow/references'`, `CLONE_DIR = '.agents/references'`,
  `ENTRY_FILE = 'REFERENCE.md'`, and the `Reference` interface with the five
  B001 §2 fields (`name`, `url`, `purpose`, `added`, optional `ref`). No parser,
  no slug/link predicate, no author — all C002.
- `modules/verifier/verifier.module.ts`: `IssueSeverity`, `Issue`
  (`field`, `message`, optional `severity`, `fix`, `line`), `VerifyResult`
  (`valid`, `issues`). No issue ids, no checks — C002 implements the 27
  store-scope classes.
- `modules/git/git.module.ts`: `CloneState`
  (`missing|present|dirty|ref-mismatch`) and `RefKind`
  (`commit|tag|branch`). No port, no `execFile` — C003.
- `services/reference-store/reference-store.services.module.ts`: `StoreError`
  (`Data.TaggedError('ReferenceStore.StoreError')` with `operation` and
  `reason`, the sibling store failure shape). Deliberately **no**
  `Context.Service`/`Impl`/`Default` yet: the capabilities are C002's, and an
  empty service record would be invented surface. C002 adds
  `Id`/`Impl`/`ReferenceStore`/`Default` and the `FileSystem`/`Path` scan.
- `apps/cli/engines.apps.module.ts`: `StoreScope { cwd; dir? }` — the shape
  every engine takes (B003 §5), placed here exactly as `reviews` places it.
- `apps/cli/renderers.apps.module.ts`: `USAGE` (all nine verbs in B003 §1
  order, both trees, `--dir` = workspace root) and `RenderOptions { human;
  verbose }` (B003 §3's two independent axes). No render functions — C004.
- `apps/cli/slash.apps.module.ts`: `COMMAND_NAME = 'mf-references'`,
  `COMMAND_DESCRIPTION` (one sentence naming the verbs, B003 §8),
  `CliUi { notify }` (the `reviews` surface) and `run`, which refuses with a
  displayable string for every invocation. No parser — C004.
- `apps/cli/binary.apps.module.ts`: `rootCommand = Command.make('mf-references')`
  with a description and no subcommands, plus `VERSION = '0.0.1'`. No flags,
  no handlers — C004.
- `apps/cli/main.ts`: `reviews/main.ts` verbatim except the binary name —
  shebang, `NodeServices.layer`, `Command.run`, `process.exitCode = 1` on
  failure.
- `apps/doctor/doctor.apps.module.ts`: `SKILL_NAMES =
  ['montflow-add-reference', 'montflow-find-reference']` (B003 §11),
  `CheckStatus`, `DoctorCheck`, `DoctorResult`,
  `DEFAULT_DOCTOR_INVOCATION = '/mf-references doctor'`. No checks, no payload,
  no installer — C006.
- `server.ts`: `ID = 'references'`, `COMMAND_NAME`/`COMMAND_DESCRIPTION`
  re-exported from the CLI (the `reviews`/`skills` pattern), a `notify` helper,
  and `export default entry(ID, (ports) => ports.command.register({…}))` whose
  `execute` runs `Cli.run` and catches the string into `notify`. No tool (C005),
  no `Live` layer (no store service yet), no `session`/`agent` port.
- `tui.ts`: `{ id: ID, setup: () => () => {} } satisfies TuiPlugin`, the
  id-only no-op all five existing packages ship (B003 §10).
- Barrels: `src/index.ts` re-exports modules, services, apps;
  `modules/index.ts` = `Git`, `Reference`, `Verifier`; `apps/index.ts` = `Cli`,
  `Doctor`; `services/index.ts` → `services/reference-store/index.ts` →
  `export * as ReferenceStore`; `apps/cli/index.ts` = `Binary`, `Engines`,
  `Renderers` + `export * from './slash…'`; `apps/doctor/index.ts` re-exports
  the doctor module. Every specifier carries `.js`.

### 3. The one test

`src/tests/entry.test.ts` (3 cases, `@effect/vitest`, sibling style): plugin id
equals `'references'` and `server.id` matches; `COMMAND_NAME ===
'mf-references'` and the description contains it; the two path constants and
`ENTRY_FILE` are the store/clone contract. It fails if the package stops
loading as a plugin, the slash name moves, or the store path drifts. Behaviour
is deliberately untested — C002–C006 add those suites.

### 4. Workspace registration

`bun install` at the repo root. `git diff --stat bun.lock` →
`1 file changed, 28 insertions(+)`, exactly three hunks: the
`packages/references` workspace block, the `@montflow/references` resolution
row, and the per-workspace `typescript` resolution row. No version churn, no
other package touched. No root script and no CI cell added (TASK 28).

### 5. Scope honour

`git status --porcelain` after the work:

```
 M bun.lock
?? .agents/@montflow/specs/montflow-references-plugin/
?? packages/references/
```

The spec directory was already untracked at HEAD (it holds the whole spec), so
the only new tracked-file candidate trees are `packages/references/` and the
lockfile. `dist/pack/**` was written by the `pack:plugins` gate itself and is
gitignored (it does not appear in `git status`).

### 6. Gate output, verbatim

Stage 0 — package shape:

```
$ bun run --cwd packages/references ts:check
$ tsc --noEmit
```

(no findings, exit 0)

```
$ bun run --cwd packages/references test
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.4 /home/daniel/dev/montflow/reference-plugin/packages/references


 Test Files  2 passed (2)
      Tests  6 passed (6)
Type Errors  no errors
   Start at  14:59:00
   Duration  482ms (typecheck 56%, import 36%, transform 7%, worker 1%)
```

(`2 test files` = the runtime pass plus vitest's typecheck pass over the same
single `src/tests/entry.test.ts`; only one `*.test.ts` exists on disk.)

Exports resolve (`ls src/index.ts src/server.ts src/tui.ts` → all three listed);
manifest maps `.` → `src/index.ts`, `./server` → `src/server.ts`,
`./tui` → `src/tui.ts`.

Stage 1 — discovery:

```
$ bun run pack:plugins
$ bun run --cwd tooling/pack cli pack
$ bun run src/main.ts pack
@montflow/profiles
  local: /home/daniel/dev/montflow/reference-plugin/packages/profiles
  artifact: /home/daniel/dev/montflow/reference-plugin/dist/pack/@montflow__profiles
@montflow/prompts
  local: /home/daniel/dev/montflow/reference-plugin/packages/prompts
  artifact: /home/daniel/dev/montflow/reference-plugin/dist/pack/@montflow__prompts
@montflow/specs
  local: /home/daniel/dev/montflow/reference-plugin/packages/specs
  artifact: /home/daniel/dev/montflow/reference-plugin/dist/pack/@montflow__specs
@montflow/reviews
  local: /home/daniel/dev/montflow/reference-plugin/packages/reviews
  artifact: /home/daniel/dev/montflow/reference-plugin/dist/pack/@montflow__reviews
@montflow/references
  local: /home/daniel/dev/montflow/reference-plugin/packages/references
  artifact: /home/daniel/dev/montflow/reference-plugin/dist/pack/@montflow__references
@montflow/skills
  local: /home/daniel/dev/montflow/reference-plugin/packages/skills
  artifact: /home/daniel/dev/montflow/reference-plugin/dist/pack/@montflow__skills
@montflow/workspace
  local: /home/daniel/dev/montflow/reference-plugin/apps/workspace
  artifact: /home/daniel/dev/montflow/reference-plugin/dist/pack/@montflow__workspace
Commit dist/pack/** on a release ref, then install with git+https://github.com/montflow/montflow.git#<sha>::path:dist/pack/<name>
```

Packed manifest — no workspace specifier:

```
$ grep -n 'workspace:' dist/pack/@montflow__references/package.json
grep-exit=1
```

and the manifest itself:

```
{
  "name": "@montflow/references",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    "./package.json": "./package.json",
    ".": "./index.js",
    "./server": "./server.js",
    "./tui": "./tui.js"
  },
  "files": ["*.js", "package.json"],
  "dependencies": {
    "@effect/platform-node": "4.0.0-rc.112",
    "effect": "4.0.0-rc.112"
  },
  "peerDependencies": {
    "@opencode/schema": "*"
  }
}
```

The four bundles emitted are `index.js`, `server.js`, `tui.js`, and
`package.json`; `@montflow/skills` and `@montflow/opencode` are bundled or
stripped, so no `workspace:*` reaches the artifact (A002 §5's contract holds for
the new package).

Extra checks (both present in the manifest, run package-scoped):

```
$ bun run --cwd packages/references lint:check
$ oxlint --deny-warnings .
```

(no findings, exit 0; the run emits two Node `MODULE_TYPELESS_PACKAGE_JSON`
warnings from `oxlint.config.ts` and `tooling/oxlint/anti-slop/effect/index.ts`,
which are pre-existing environment noise and not lint findings)

```
$ bun run --cwd packages/references format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 284ms on 27 files using 16 threads.
```

Smoke beyond the gates (not required, not a gate):

```
$ bun run --cwd packages/references cli --help
$ bun run src/apps/cli/main.ts --help
DESCRIPTION
  Register, materialize, and verify third-party reference clones stored in .agents/@montflow/references.

USAGE
  mf-references [flags]

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  …
```

so the `bin` entry loads and `effect/cli` owns the command.

### 7. What was deliberately not done

- No `.agents/@montflow/references/` directory. B001's handoff to C001 asked
  for it, but (a) this task's declared scope is `packages/references/`,
  `bun.lock`, `.agents/@montflow/specs/`, (b) git cannot commit an empty
  directory, and (c) C007 writes all 14 entries and therefore creates the
  directory in the same change. Recorded as Open Question 1.
- No 14 store entries (C007), no verb behaviour (C002–C006), no skills payload
  or generator (C006), no plugin-loader target (outside scope — Open
  Question 2), no root script, no CI cell, no docs.
- No `CONTEXT.md` under `src/apps/cli` — E003 writes the folder contract
  (B003 §6), and `reviews` has none to copy.

## Open Questions

1. **Store-root creation ownership.** B001's handoff to C001 says "create
   `.agents/@montflow/references/` … the directory must exist even when it holds
   no entries". This task's scope excludes that path and an empty directory
   cannot be committed, so C007 now owns creating it alongside the 14 entries.
   If the orchestrator wants the directory proven present before C007, either
   widen C001's scope or add a `.gitkeep` decision (the `reviews`/`profiles`
   stores have no placeholder; only the clone root does).
2. **Plugin-loader smoke coverage.** `packages/opencode/test/plugin-loader.test.ts`
   hardcodes its targets and face list (A002 §5), so `turbo smoke` will not load
   `@montflow/references` until that test is extended. A002's C001 handoff asks
   for it, but `packages/opencode` is outside this task's scope. C007 (which
   owns the gate wiring) or a new task should add `references` to the target and
   face assertions.
3. **`generate:payload` has no generator yet.** The script is declared
   (required by TASK 23) and currently fails with
   `error: Module not found "scripts/generate-embedded-skills.ts"` because the
   payload and `skills/` are C006's. `build:cli` intentionally omits the
   generator step until then. C006 must add the script and prepend it to
   `build:cli` (the `reviews`/`skills`/`prompts` form).
4. **`@montflow/skills` is an unused dependency until C002/C006.** It is
   declared per B003 §12 (skill-standard verification for `verify`/`doctor`) and
   nothing imports it yet; `pack:plugins` strips it from the artifact, so it is
   harmless, but a reviewer should know it is a decided forward dependency, not
   dead weight.
5. **Empty-service question for C002.** `services/reference-store` carries only
   `StoreError` today. C002 must decide the `Impl` shape (`list`/`read`/`write`)
   and add `Id`/`Context.Service`/`Default`; no consumer exists to constrain it.

## Handoff

- **C002 (registry + verify):** implement the parser, `SLUG_PATTERN`/date/ref
  predicates, the 27 store-scope issue classes, and the four zero-clone
  fixtures from B001 §11.6 inside `modules/reference` + `modules/verifier`;
  replace the stub types in place (keep the exported names `Reference`,
  `Issue`, `VerifyResult` and the path constants — the package README and
  `entry.test.ts` cite them); add `Context.Service`/`Default` to
  `services/reference-store`.
- **C003 (git lifecycle):** fill `modules/git` behind one `GitPort`
  (`execFile`, `profile-probe` seam, B002 §12); `CloneState`/`RefKind` are the
  only exported names today, keep them. Uses `Reference.CLONE_DIR` for
  derivation; never store the path.
- **C004 (CLI + slash):** own `engines.apps.module.ts` (`StoreScope`),
  `renderers.apps.module.ts` (`USAGE`, `RenderOptions`), the nine verbs in
  `binary.apps.module.ts`, and the parser in `slash.apps.module.ts`. The
  `run` stub refuses every invocation with a displayable string — replace it,
  keep `COMMAND_NAME`/`COMMAND_DESCRIPTION`/`CliUi` names.
- **C005 (tools):** add `reference_add`/`reference_find` to `server.ts` via
  `defineTool`; the entry already registers the command and catches to
  `notify`. Add a `Live` layer only when a store service exists (C002).
- **C006 (skills + doctor):** add `skills/<name>/`, the generator, prepend it
  to `build:cli`, extend `doctor.apps.module.ts` (`SKILL_NAMES` already names
  both skills), and add the embedded payload plus its tests.
- **C007 (migration + gate):** create `.agents/@montflow/references/` with the
  14 entries (Open Question 1), add `mf:check:references`, the CI cell, and the
  plugin-loader target (Open Question 2).
- **E003 (docs):** `packages/references/README.md` exists and documents the
   store, clone root, commands, both tools, both skills, and the scoped
  invocation `bun run --cwd packages/references cli verify <slug> --dir $PWD`;
  E003 still needs `src/apps/cli/CONTEXT.md`.

## Deviations

- **No `PHASE.md`, `BOARD.md`, or `MAILBOX.md`** exists in the spec directory,
  so the profile's step 5 broadcast could not be written. Same gap every prior
  task recorded; Handoff above is the substitute.
- **Gate order and repetition.** The gates were run in `GATES.md` order after
  the scaffold stabilised; `pack:plugins` was run three times during the work
  (before, during, and after the README edit) to confirm discovery, and the
  final run's output is the one quoted in Findings §6. `dist/pack/**` is
  produced by that gate and is gitignored, so it is not a repo change.
- **One test failure was fixed during the work**, not hidden: the entry test
  asserted `COMMAND_DESCRIPTION` contains `'mf-references'` while the first
  draft said "Run the references CLI …". The description was corrected to
  "Run the mf-references CLI …" (matching the `reviews` phrasing) rather than
  weakening the test. The quoted `test` output above is from after the fix.
- **B001's C001 handoff item "create the store root" was not executed** — scope
  and empty-directory semantics, recorded as Open Question 1 rather than
  silently skipped.
- **No root `package.json` / CI / docs / skills / other-package edit**, per the
  task's explicit scope. `bun install` touched `bun.lock` only.
- **No network, no clone, no git write.** `pack:plugins` and the package scripts
  are local; no reference was registered, cloned, or verified against the
  network.
- **Only file written outside `packages/references/`:** `bun.lock` (by
  `bun install`, as instructed) and this `MEMORY.md`. No `SPEC.md`, `TASK.md`,
  status, lock, or ledger was touched.
