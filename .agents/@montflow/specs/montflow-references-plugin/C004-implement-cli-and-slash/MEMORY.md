# Memory

## Context

- Task: **C004 — implement-cli-and-slash** (execution, gated), spec
  `montflow-references-plugin`, in-place workspace at
  `/home/daniel/dev/montflow/reference-plugin`.
- Binding rules read: `.agents/@montflow/profiles/spec-worker/PROFILE.md`
  (1–53). Task read: `.../C004-implement-cli-and-slash/TASK.md` (1–39) and
  `GATES.md` (1–14).
- Contract sources read in full: B003 `MEMORY.md` (§1 verb order, §2 closed flag
  table, §3 output modes and exact agent grammar, §4 exit contract, §5
  engine/renderer/test split, §13.4 `remove`, §14 downstream obligations) and
  B002 `MEMORY.md` (verb sequences, exact messages, `status` vocabulary and
  `behind=`/`ahead=` order, moved-tag `expected=`/`remote=`, exit items).
- Implementation consumed: C001/C002 (`Reference`, `ReferenceStore`,
  `CloneProbe`, `Verifier`) and C003 (`GitPort`, `GitLifecycle` with
  `add`/`update`/`sync`/`status`, `StatusRow`, `resolveRemoteRef`).
- Live precedent read end to end: `packages/reviews/src/apps/cli/`
  (`engines`, `renderers`, `binary`, `slash`, `main`) and its tests;
  `packages/skills/src/apps/cli/slash.apps.module.ts` for the hand-rolled
  parser; `packages/opencode` command port for `register`.
- Scope executed: only `packages/references/` and this `MEMORY.md`. No plugin
  tool, doctor check, skill, doc, root script, CI cell, or store entry was
  added. `SPEC.md`, `TASK.md`, `GATES.md`, statuses, locks, and ledgers were not
  edited.

## Progress

Done, in order:

1. Read the profile, C004 `TASK.md`/`GATES.md`, B003 and B002 in full, the C003
   handoff, and the live `reviews`/`skills` CLI precedent.
2. Implemented eight engines in `src/apps/cli/engines.apps.module.ts`:
   `list`, `show`, `verify` (+`verifyAll`), `add`, `update`, `updateAll`,
   `sync`, `status`, `remove`, all over `StoreScope` and failing with a
   displayable string. `Live` is the one layer over `ReferenceStore`,
   `CloneProbe`, `GitPort`, `GitLifecycle`, `FileSystem`, and `Path`.
3. Implemented pure renderers in `renderers.apps.module.ts`: agent default
   (stable tokens, no glyphs), `--human` tables/prose, `--verbose` additive and
   composable; `status` one row per entry with state, full `--verbose` detail,
   moved-tag `expected=`/`remote=`, and `behind=` before `ahead=`.
4. Replaced the binary scaffold with the `effect/cli` tree for all eight verbs
   and the B003 §2 flag set; `VERSION` now reads `package.json`.
5. Replaced the slash scaffold with the hand-rolled parser (`run` + `register`),
   the same verb set and per-verb flag sets as the binary, quotes and
   `--flag=value`, and usage errors for unknown flags / bad selection.
6. Wired `src/server.ts` through `Cli.register(ports)`.
7. Added `--verbose` data to `StatusRow` (`path`, `origin`, `head`,
   `upstream`) so the renderer can honour B003 §3 without a second git probe.
8. Added 32 CLI tests across engines, renderers, slash, and binary; all gates
   below pass.
9. Mapped every `GATES.md` checkbox to a named passing test or command.

## Findings

### 1. What was built

| File | Change |
|---|---|
| `src/apps/cli/engines.apps.module.ts` | eight engines + `Live` layer |
| `src/apps/cli/renderers.apps.module.ts` | `USAGE`, `RenderOptions`, every verb renderer, `HUMAN_ONLY_GLYPHS` |
| `src/apps/cli/binary.apps.module.ts` | `effect/cli` command tree, `exitFailed`, `VERSION` from package.json |
| `src/apps/cli/slash.apps.module.ts` | typed parser, `tokenize`, `parseCliArgs`, `run`, `register` |
| `src/server.ts` | delegates `/mf-references` registration to `Cli.register` |
| `src/modules/git/lifecycle.module.ts` | `StatusRow` gains optional `path`/`origin`/`head`/`upstream`; rows enriched at the end of `status` |
| `tsconfig.json` | `resolveJsonModule` for the package version import |
| `src/apps/cli/tests/fixtures.ts` | hermetic git fixtures, recording port, `realLive`/`cloningLive` |
| `src/apps/cli/tests/engines.test.ts` | 16 engine cases |
| `src/apps/cli/tests/renderers.test.ts` | 4 renderer cases |
| `src/apps/cli/tests/slash.test.ts` | 7 parser/run cases |
| `src/apps/cli/tests/binary.test.ts` | 3 exit/entry cases |

`main.ts`, `index.ts`, `package.json`, and the doctor module were not changed
(`main.ts` already had the required shebang and exit-code handling).

### 2. Engines — structured in, data out

- `list(scope, {status?, invocation?})` → `ReferenceRow[]`. Filesystem presence
  only (`readLink`/`stat`), `installed|missing` filter, `refused: unknown status
  '<v>'; use installed or missing`, and the verifier’s
  `Store root … is missing` message when the store directory is absent.
- `show(scope, name, invocation?)` → raw bytes; unknown slug is
  `refused: unknown reference '<name>'; run '<invocation> list'`.
- `verify(scope, {name?, all?, clones?, invocation?})` → `VerifyReport`
  (`entries`, `issueCount`, `warningCount`, `storeMissing`). CI-safe default;
  `--clones` is the only path that calls `CloneProbe`. `name + --all` is a usage
  refusal; an unknown name is the same unknown-reference refusal as the other
  verbs. `verifyAll` is the `--all` wrapper.
- `add(scope, url, {name?, ref?, purpose?, invocation?})` → C003 `AddResult`
  (`created` / `routed` / refusal). A routed result carries update’s result, so
  no caller can report success on the notice alone.
- `update(scope, target, {force?, invocation?})` → `UpdateResult`;
  `updateAll(scope, {force?})` → `{entries, summary, failed}` in slug order with
  `summary total=<n> present=<n> failed=<n>`.
- `sync(scope, {name?, all?, invocation?})` → `SyncReport | LifecycleFailure`;
  C003 owns the usage xor and the `never writes the store` guarantee.
- `status(scope, {name?, fetch?, invocation?})` → `StatusReport |
  LifecycleFailure`; no name means all entries; `refused` is true only for a
  foreign path or a `--fetch` failure.
- `remove(scope, name, {keepClone?, invocation?})` → `RemoveResult`
  (`message` = `removed <slug>` / `removed <slug> clone=kept`). Uses
  `CloneProbe` for ownership/dirtiness, so dirty and foreign clones refuse
  without `--keep-clone`; a missing clone only removes the entry.
- No engine parses argv, renders, or touches `process.exitCode`.

### 3. Renderers — two axes, four combinations

- Agent default: `installed|missing <slug>  <purpose>` + `summary` for `list`;
  `error …` blocks + `summary` for `verify`; `ok|created|updated|removed|…`
  lines for the lifecycle verbs; `status` uses C003’s exact row message and
  summary; no `✓ ✗ ⚠ •`.
- `--verbose`: appends `url=`/`ref=` and `  path:` to `list`; `path=` to
  `add`/`update`/`sync`/`remove`; `ok <path>` to `verify`; and
  `path=`/`origin=`/`head=`/`upstream=` to `status`. It never removes or
  reorders.
- `--human`: aligned tables for `list`, `status`, `update --all`, `sync`;
  glyph-marked blocks for `verify`; prose for `add`/`update`/`remove`. It does
  not imply `--verbose`; the matrix is tested.
- `status` preserves C003/B002 literals byte-for-byte, including
  `ref-mismatch svelte ref=v1 expected=<sha7> remote=<sha7>` and
  `present pi behind=1 ahead=2` (behind first).
- `USAGE` lists the eight verbs in canonical order (doctor is C006’s).

### 4. Binary and slash parity

- Binary: `list`, `show`, `verify`, `add`, `update`, `sync`, `status`,
  `remove`; flags `--dir`, `--human`, `--verbose`, `--status`, `--all`,
  `--clones`, `--name`, `--ref`, `--purpose`, `--force`, `--fetch`,
  `--keep-clone`. `show` declares only `--dir`; an output-mode flag there is an
  unknown-flag usage error, as B003 §2 requires.
- Slash: one typed `FlagSpec` per verb; boolean flags never consume the next
  token (`verify --clones alpha` keeps `alpha`); `--flag=value` and quoted
  spans work. Missing positional, both/neither selection, and unknown flags
  return `Usage`, which notifies a `usage:` line and fails with the same text.
- `sync` with neither a name nor `--all` is a usage error from C003’s lifecycle
  (tested at the engine, slash, and binary layers); `status` with no name is an
  all-entry report ending in the summary and exits 0.
- Refusals set `process.exitCode = 1` inside the binary handler through
  `exitFailed`; neither front end calls `process.exit`.
- `register(ports)` owns the command-port registration and provides
  `Engines.Live`; `server.ts` is now a one-line delegation.

### 5. Gate output, verbatim

```text
$ bun run --cwd packages/references cli --help
$ bun run src/apps/cli/main.ts --help
DESCRIPTION
  Register, materialize, and verify third-party reference clones stored in .agents/@montflow/references.

USAGE
  mf-references <subcommand> [flags]

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)

SUBCOMMANDS
  list      List every reference with its clone presence and purpose.
  show      Print one entry’s REFERENCE.md bytes.
  verify    Verify committed store bytes, optionally with local clone state. Non-zero on any issue.
  add       Register and clone one https URL. A registered URL routes to update.
  update    Refresh one entry, or --all, by name or URL.
  sync      Materialize missing clones or repair local checkouts. Never writes the store.
  status    Report local clone state for one entry or every entry. Reports never gate.
  remove    Unregister one entry and, unless --keep-clone, its clean clone.
```

```text
$ bun run --cwd packages/references cli --version
$ bun run src/apps/cli/main.ts --version
mf-references v0.0.1
```

```text
$ bun run --cwd packages/references test
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.4 /home/daniel/dev/montflow/reference-plugin/packages/references


 Test Files  22 passed (22)
      Tests  200 passed (200)
Type Errors  no errors
   Start at  15:50:42
   Duration  3.75s (import 53%, tests 41%, typecheck 3%, transform 2%)
```

```text
$ bun run --cwd packages/references ts:check
$ tsc --noEmit
```

(no findings, exit 0)

```text
$ bun run --cwd packages/references lint:check
$ oxlint --deny-warnings .
(node:1399007) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/reference-plugin/oxlint.config.ts?cache=1793044196825 is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/reference-plugin/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:1399007) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/reference-plugin/tooling/oxlint/anti-slop/effect/index.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/reference-plugin/tooling/oxlint/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
```

(no lint findings, exit 0; the two `MODULE_TYPELESS_PACKAGE_JSON` warnings
are the pre-existing environment noise C001–C003 recorded)

```text
$ bun run --cwd packages/references format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 248ms on 43 files using 16 threads.
```

### 6. `GATES.md` checkbox → named passing test / command

| Stage | Checkbox | Evidence |
|---|---|---|
| 0 | `mf-references --help` lists `list`, `show`, `verify`, `add`, `update`, `sync`, `status`, `remove` | the `cli --help` output above; `renderers usage > lists the verbs in canonical order` |
| 0 | `list`, `show`, `verify`, and `status` render compact agent-first output by default | `renderers agent default > renders every verb with stable tokens and no glyphs` (list/verify/status); `CLI engines show > shows one entry byte for byte…` proves `show` is raw bytes with no renderer |
| 0 | `--human` renders readable tables/prose and composes with `--verbose` | `renderers human mode > renders tables and prose and composes with verbose`; `renderers agent default > —verbose stays additive for every verb` |
| 0 | the slash command exposes the same verb set | `slash parser > parses every verb with the binary flag set`; `… > reports usage errors for unknown flags, missing names, and bad selection` |
| 1 | `sync` with no name and no `--all` is a usage error | `CLI engines sync > clones a missing entry and refuses neither/both selection`; `slash run > fails with a displayable message for a refusal and a usage error`; CLI verbatim run below |
| 1 | a refusal exits non-zero without calling `process.exit` | `mf-references binary > marks a refusal as a non-zero exit without leaving the process`; `… > never calls process.exit in either front end` |
| 1 | `remove --keep-clone` keeps the clone; `status` exits 0 with a summary | `CLI engines remove > removes the entry and its clone, and keeps a clone with --keep-clone`; `CLI engines status > reports one row per entry, exits 0 on state…`; `slash run > runs status with no name as an all-entry summary` |

Command evidence for the `sync` usage row:

```text
$ bun run --cwd packages/references cli sync --dir /tmp/opencode/ref-test
$ bun run src/apps/cli/main.ts sync --dir /tmp/opencode/ref-test
usage: mf-references sync <name> (or mf-references sync --all)
error: script "cli" exited with code 1
```

Manual `status`/`remove` smoke (throwaway fixture under `/tmp/opencode/ref-manual`):

```text
$ bun run --cwd packages/references cli status --dir /tmp/opencode/ref-manual --human --verbose
MARK  STATE  SLUG   DETAIL   PATH                      ORIGIN                                HEAD     UPSTREAM
----  -----  -----  -------  ------------------------  ------------------------------------  -------  --------
✗     dirty  alpha  files=1  .agents/references/alpha  https://example.test/owner/alpha.git  6abb39c  -
summary total=1 missing=0 present=0 dirty=1 ref-mismatch=0 foreign=0
$ bun run --cwd packages/references cli remove alpha --keep-clone --dir /tmp/opencode/ref-manual
removed alpha clone=kept
$ bun run --cwd packages/references cli status --dir /tmp/opencode/ref-manual
summary total=0 missing=0 present=0 dirty=0 ref-mismatch=0 foreign=0
```

### 7. Test inventory

- `CLI engines list`: installed/missing + `--status` filter; unknown status and
  missing store root.
- `CLI engines show`: raw bytes; unknown slug.
- `CLI engines verify`: zero-clone clean; `--clones` additive; name form,
  unknown name, name + `--all`.
- `CLI engines add`: created through the recording port; ssh / missing purpose
  / routed URL.
- `CLI engines update`: update, no-op `present`, dirty refusal, unknown target;
  `updateAll` partial failure summary.
- `CLI engines sync`: missing clone + neither/both usage; dirty skip without a
  store write.
- `CLI engines status`: one row per entry, exit-0 report, `behind` before
  `ahead`; foreign refusal and unknown name.
- `CLI engines remove`: entry + clone removal; `--keep-clone`; dirty/foreign
  refusals; missing clone.
- `renderers agent default`: every verb, stable tokens, no glyphs; verbose
  additive.
- `renderers human mode`: tables/prose and human+verbose.
- `renderers usage`: canonical verb order.
- `slash parser`: every verb/flag, quotes, boolean-vs-positional, all usage
  errors.
- `slash run`: human+verbose threading, `status` all-entry summary, refusal and
  usage failures, add refusal.
- `mf-references binary`: `exitFailed`, no `process.exit(`, version.

## Open Questions

1. **`update`/`sync` verbose fields.** `status` now carries
   `origin`/`head`/`upstream` (added to C003’s `StatusRow`) and renders them.
   C003’s `UpdateResult`/`SyncEntry` carry no origin/upstream, so those two
   verbs’ `--verbose` adds only `path=` (and `head=` where the result already
   has it, for `update`). Making them match B003 §3 exactly needs one of:
   extend the C003 result shapes, or re-probe each entry in the engine. Both
   are follow-ups, not renderer bugs.
2. **Slash unknown flag/verb.** B003 §5’s proposed test name says “treats an
   unknown flag as help”, while §2/§4 call an unknown flag a usage error. C004
   implements the §2/§4 rule: `Usage` notifies a `usage:` line and fails. A
   reviewer may prefer `Help`; one parser change.
3. **`verify` unknown name.** B003 does not spell it out; C004 refuses with the
   same `unknown reference` message as `show`/`update`/`status`. It could
   instead be a one-entry verification issue.
4. **`doctor` is not registered.** C004’s GATES list eight verbs and C006 owns
   the checks; the root `Command` tree is ready for a ninth subcommand and the
   slash parser for a `Doctor` variant. Help therefore lists eight, not the
   nine B003 §1 describes.
5. **`CONTEXT.md`.** B003 §14 assigns `src/apps/cli/CONTEXT.md` to C004, but the
   C004 TASK/GATES do not require it and D002/E003 own documentation. Not
   added.

## Handoff

- **C005 (tools):** import `Engines` directly; `add` returns the routed result
  with update’s own result, so a tool must fail when
  `result.kind === 'routed' && Renderers.updateFailed(result.update)`. `find`
  needs `Engines.list` plus `Engines.show` and the `reference_find` path
  exception; CLI defaults still hide the clone path.
- **C006 (doctor):** add a `doctor` subcommand to the root command’s
  `subcommands` in `binary.apps.module.ts` and a `Doctor` variant + parser case
  in `slash.apps.module.ts`; `Engines.Live` already carries the platform layers.
  Do not reuse `list`’s missing-store failure as the doctor check.
- **C007 (gate):** `verify --all` is CI-safe and `verify --all --clones` adds
  local clone truth; `status` is a report and must not gate. `mf-references
  remove --keep-clone` is the supported way to unregister a dirty/foreign
  clone.
- **D001/D002/E003:** the README table already names the eight verbs; the
  scoped invocation table in B003 §6 is unchanged. `USAGE` is the canonical
  help string for both fronts.

## Deviations

- **`StatusRow` extended in C003’s lifecycle module.** Four optional detail
  fields were added so `status --verbose` can print `path=`, `origin=`,
  `head=`, `upstream=` without a second probe. No C003 message, state, or exit
  behaviour changed; the C003 tests still pass.
- **`remove` lives in the CLI engines.** C003 exposed no remove operation;
  C004 implements it over `ReferenceStore` + `CloneProbe` + `FileSystem` with
  B003 §13.4’s exact refusals and default cleanup.
- **`server.ts` delegates to `Cli.register`.** The plugin entry now imports
  only the CLI barrel, which keeps the command definition and its Live layer in
  the same module as `run`.
- **`resolveJsonModule` added to the package tsconfig** so `VERSION` can read
  `package.json` instead of duplicating `0.0.1`.
- **`doctor` intentionally absent from the command tree** (C006 owns it);
  GATES Stage 0 lists exactly the eight implemented verbs.
- **Only `packages/references/` and this `MEMORY.md` were written.** `bun.lock`
  was already modified by C001’s install and was not touched here. No spec
  state, lock, ledger, or other task directory was edited.
