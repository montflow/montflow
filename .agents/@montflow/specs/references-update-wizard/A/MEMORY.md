# Memory

## Context

Phase A implements the core `mf-references update` target selection: the
`--ref <commit|tag|branch>` and `--latest` flags, the `REFERENCE.md`
read-modify-write in the lifecycle, and the interactive `--wizard` prompt. This
is the bulk of the feature. A001 owns the lifecycle/module layer; A002 owns the
CLI adapter layer (binary + slash + engines + renderers) and the wizard prompt
code. A001 must land before A002 because the CLI wiring routes into the new
engine surface.

## Progress

- A001 engine-update-target: complete
- A002 wire-cli-flags-and-wizard: complete
- A003 review-phase: complete (waived)

## Open Questions

- None.

## Handoff

- See PHASE.md.

## Deviations

- Phase A review decision: `waived` (`verification.light`) — A003 binds no
  reviewer profile and the phase gate is mechanical, so `mf-specs review decide`
  waived the round. Recorded here per the A003 completion checklist.

## Execution Brief

- Read: this brief, the task's TASK.md/GATES.md, `packages/references/src/modules/git/lifecycle.module.ts`, `packages/references/src/modules/git/git.module.ts`, `packages/references/src/modules/reference/reference.module.ts`, `packages/references/src/services/reference-store/reference-store.services.module.ts`, `packages/references/src/apps/cli/binary.apps.module.ts`, `packages/references/src/apps/cli/slash.apps.module.ts`, `packages/references/src/apps/cli/engines.apps.module.ts`, `packages/references/src/apps/cli/renderers.apps.module.ts`, and the reference package tests under `packages/references/src/apps/cli/tests/`.
- Write scope: the task's directory plus only the files its TASK.md names; record writes go to the task MEMORY.md.
- Gate: point at the task GATES.md; the worker runs scoped checks, and the orchestrator runs each gate once.
- Record: keep the worker MEMORY.md at or under 80 lines; full logs go to /tmp/<task-id>.log.
- Review: batch every open finding into one fixer attempt and one re-review after review decide.