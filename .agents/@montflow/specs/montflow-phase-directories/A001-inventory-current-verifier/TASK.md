---
id: A001
name: inventory-current-verifier
type: exploratory
originator: user
depends-on:
related-tasks:
status: complete
---

# Task A001: inventory-current-verifier

## Type: exploratory

## Description

Map every place on the current tree that assumes a task directory sits directly
under the spec root. The phase-directory change is only safe if the inventory is
complete: a missed one-level assumption either drops a check silently (gates,
review attribution) or rejects the new tree for the wrong reason.

## Requirements

- Read `packages/specs/src/modules/structure/structure.module.ts`,
  `modules/task/task.module.ts`, `modules/scaffold/scaffold.module.ts`,
  `modules/spec/spec.module.ts`, `modules/lifecycle`, `modules/review-link`,
  `services/spec-store/spec-store.services.module.ts`, and
  `apps/cli/cli.apps.module.ts`.
- For each site record, in a MEMORY.md table: file and symbol, the assumption it
  makes about depth or phase, whether it must change, and the task that owns the
  change.
- Cover at minimum: the structure module's single-slash directory split,
  `nest`, `ROOT_STRAY_HINT`, `TASK_DIR_REQUIRED`, and the `locked-phases` /
  per-phase review checks; `Task.parseTaskDirName` and `verifyTaskFile`'s
  directory argument; the store snapshot's recursive listing and its
  file-only filter; the CLI's `gatedTaskIds`, `summarize`, and `renderStatus`
  grouping; the scaffold's `dirName` paths; and the reviews package's
  `verifySpecProfiles` scan.
- State which consumers are already depth-agnostic and must not be edited:
  anything keyed on `phaseOf(id)` (review-link, lifecycle, status grouping) and
  anything matching `endsWith('TASK.md')`.
- List every test, fixture, and packaged artifact that pins a flat path, with
  file and test name, so D001–D004 can be checked against it.
- Use `git grep` evidence for the inventory; write it to MEMORY.md. Change no
  file outside this spec.

## Completion

- [x] MEMORY.md holds one table row per assumption-bearing site, each marked change or no-change with an owning task
- [x] No site is left unclassified, and the "must not be edited" list names the id-keyed consumers
- [x] Every flat-path test and fixture is listed with its file and test name
- [x] `git status` shows no change outside `.agents/@montflow/specs/montflow-phase-directories/`
