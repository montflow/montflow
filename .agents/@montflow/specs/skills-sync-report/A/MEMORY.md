# Memory

## Context

The phase makes write-mode `mf-skills sync` print a concise per-outcome summary
of added, updated, unchanged, and skipped skills, matching the `--check` style.
The engine (`packages/skills/src/apps/sync/sync.apps.module.ts`) already returns
per-skill `outcome` values plus `changed` and `drifted`; only the CLI surface
(`packages/skills/src/apps/cli/`) is in scope — the front-ends and the tests
that assert their bytes.

## Progress

- pending

## Open Questions

- None.

## Handoff

- See PHASE.md.

## Deviations

- None.

## Execution Brief

- Read: this `MEMORY.md` `## Execution Brief`, the task's `TASK.md`/`GATES.md`,
  and only the scoped source paths the task names — never a broad grep over
  generated payloads, lockfiles, or other tasks' records.
- Write scope: the task's own directory and only the files its `TASK.md` names;
  record writes go to the task `MEMORY.md`. Nothing outside the task's
  `write-scope:` and directory.
- Gate: the task `GATES.md` owns the task's commands; the worker runs the scoped
  check, and the orchestrator runs each gate once (task gates at the task, the
  repo-wide suite at the phase boundary, never copied into a task).
- Record: keep the worker `MEMORY.md` at or under 80 lines with the fixed section
  set (Context, Progress, Findings, Gates, Open Questions, Handoff, Deviations);
  full logs go to `/tmp/<task-id>.log` and are referenced, never pasted.
- Review: this phase is `waived`; batch every open finding into one fixer attempt
  and one re-review, keyed off `mf-specs review decide`, before the phase locks.
