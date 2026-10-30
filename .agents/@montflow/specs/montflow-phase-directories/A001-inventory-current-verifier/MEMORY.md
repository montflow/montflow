# Memory

## Context

Task A001: inventory every site on the current tree that assumes a task
directory sits directly under the spec root. Read-only: the only output is this
inventory. Feeds B001 (verifier contract), B002 (tooling), C001–C003, and
D001–D004.

## Progress

- 2026-10-28: complete. Inventory below; no file outside this spec changed.

## Findings

### 1. Depth-sensitive sites — must change

| Site | Assumption today | Change | Owner |
| --- | --- | --- | --- |
| `structure.verifySpecTree` directory map | first `/` is the task directory (`file.path.slice(0, slash)`) | walk root → phase → task | C002 |
| `structure.verifySpecTree` nested-path guard | `rest.includes('/')` means malformed | allow exactly `<phase>/<task>/<file>` and reject deeper | C002 |
| `structure.ROOT_STRAY_HINT` | `TASK.md` / `MEMORY.md` / `GATES.md` at the root are mislaid task files | keep for the root, add phase-level hints | C002 |
| `structure` phase set | phases are derived from task ids only | phases come from phase directories | C002 |
| `structure` `locked-phases` existence check | checked against id-derived phases | checked against phase directories | C002 |
| `structure` one-`review`-per-phase check | scans tasks by `phaseOf(id)` | per phase directory | C002 |
| `structure` task-directory parse | `parseTaskDirName(dir)` on a root directory | parse the leaf and compare letters to the phase dir | C002 |
| `cli.gatedTaskIds` | first `/` is the task directory | read the leaf of `<phase>/<task>/GATES.md` | C002 |
| `scaffold.renderSpecScaffold` paths | `dirName(id, name)` at the root | `${phase}/${id}-${name}` | C002 |
| `scaffold` report | root-level task paths | phase-prefixed POSIX paths | C002 |
| `SpecStore.snapshot` | pushes files only, drops directories from the recursive listing | push `kind: 'directory'` entries | C001 |
| `apps/workspace` `specs.services.module.ts` (`SnapshotFile`, `readSnapshot`) | second, file-only snapshot reader handed straight to `verifySpecTree` | add `kind` and emit directory entries | C001 |
| `structure.SpecFileEntry` / `SpecSnapshot` | file-only entries, no `kind` | optional `kind`, directory set union | C001 |
| structure test helpers (`entry`, `snapshot`) | build file-only snapshots | add a directory entry helper | C001 |
| `packages/specs/fixtures/**` | flat task directories | migrate to phase directories | C002 |

### 2. Depth-agnostic sites — do not edit

| Site | Why it survives |
| --- | --- |
| `task.TASK_DIR_PATTERN`, `parseTaskDirName`, `verifyTaskFile` | all take a leaf directory name, never a path |
| `task.phaseOf`, `task.phaseRank` | pure id-string functions |
| `review-link.verify` | groups review tasks by `phaseOf(task.id)`; ids do not move |
| `lifecycle.analyze` / `verify` | works on `{ id, status }`; ids do not move |
| `structure` id/name, table, duplicate-id, dependency, cycle checks | keyed on ids and leaf names |
| `cli.summarize` | scans `file.path.endsWith('/TASK.md')` |
| `cli.renderStatus` phase grouping | groups by `task.id.replace(/\d+$/, '')` |
| `cli.next` `inPhase` filter | filters by `phaseOf(task.id)` |
| `reviews.verifySpecProfiles` | scans `file.path.endsWith('TASK.md')` |
| `spec` `locked-phases` parsing and `PhaseId` verification | phase tokens only |

### 3. Tests, fixtures, and packaged artifacts that pin a flat path

- `src/modules/structure/tests/verify-spec-tree.test.ts` — 28 cases, all
  snapshots use `A001-…/TASK.md`, `B001-…/`; the placement-hint assertion
  expects `TASK.md must live inside a task directory: <phase>/A001-<kebab-name>/TASK.md.`
- `src/modules/structure/tests/helpers.ts` — `entry` / `snapshot` are file-only.
- `src/services/spec-store/tests/spec-store.test.ts` — exact snapshot path
  list (`A001-implement-login/TASK.md`) and `write` inputs.
- `src/modules/scaffold/tests/scaffold.test.ts` — asserts flat
  `<id>-<name>/TASK.md` paths (C002 edits it).
- `src/apps/cli/tests/fixtures.test.ts` — fields such as
  `A002-explore-thing/MEMORY.md`, `A003-bad-kind/TASK.md: type`, plus the
  `fixtures/.agents/@montflow/specs` root.
- `src/apps/cli/tests/{create,next,status,list,check,run-slash}.test.ts` —
  scaffolded paths and status/next output built on flat directories.
- `src/tests/server.test.ts` — slash-command create expectations.
- `packages/reviews/src/apps/cli/tests/verify-spec-profiles.test.ts` — writes
  `demo/C099-review-phase/TASK.md` and asserts that flat path.
- `apps/workspace/src/services/specs/tests/specs.test.ts` — `makeRoot` writes
  `A001-implement-thing/` and `A099-review-phase/` at the spec root; its four
  fixture-built cases fail after the layout lands (C002 moves it).
- `packages/specs/fixtures/.agents/@montflow/specs/{mock-ok,mock-complete,mock-stale,mock-bad}` —
  four flat trees.
- `.agents/skills/montflow-create-pi-specs/SKILL.md`,
  `packages/specs/skills/montflow-create-pi-specs/SKILL.md`, and the
  `montflow-find-pi-specs` copies — prose that names the one-level layout.
- `packages/specs/fixtures/README.md`, `packages/specs/README.md`,
  `packages/specs/src/skills/{authoring-spec,executing-spec}.ts` — prose that
  names the one-level layout.
- `git grep` count: 100 flat task-path literals across 16 source files; two
  first-slash consumers (structure, CLI).

### 4. Notable non-finding

`tooling/pack` splits module specifiers, not spec paths — out of scope.

## Open Questions

- None.

## Handoff

- Feeds B001 (finding table, tolerance), B002 (tooling/rollout), C001–C003, and
  the fixture work in C002/D002.
- The two depth-sensitive consumers are exactly `structure` and
  `cli.gatedTaskIds`; everything else is id-keyed or `endsWith`-based.

## Deviations

- None.
