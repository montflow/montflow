# Memory

## Context

Phase B surfaces the tracking-vs-pinned distinction that the new `--ref`/
`--latest`/`--wizard` update surface makes important: `status` and `verify`
(and their renderers) must report whether an entry is tracking a branch or
pinned to a commit. B001 owns the status/verify/lifecycle/renderer changes.
B002 aligns the `montflow-add-reference` skill and the CLI usage/CONTEXT docs to
teach the new flags and the distinction. Both tasks are small and independent.

## Progress

- B001 status-verify-ref-kind: pending
- B002 align-skill-and-docs: pending
- B003 review-phase: pending

## Open Questions

- None.

## Handoff

- See PHASE.md.

## Deviations

- None.

## Execution Brief

- Read: this brief, the task's TASK.md/GATES.md, `packages/references/src/modules/git/git.module.ts`, `packages/references/src/modules/git/lifecycle.module.ts`, `packages/references/src/modules/verifier/verifier.module.ts`, `packages/references/src/apps/cli/renderers.apps.module.ts`, `packages/references/src/apps/cli/engines.apps.module.ts`, `packages/references/skills/montflow-add-reference/SKILL.md`, and the reference package tests under `packages/references/src/apps/cli/tests/`.
- Write scope: the task's directory plus only the files its TASK.md names; record writes go to the task MEMORY.md.
- Gate: point at the task GATES.md; the worker runs scoped checks, and the orchestrator runs each gate once.
- Record: keep the worker MEMORY.md at or under 80 lines; full logs go to /tmp/<task-id>.log.
- Review: batch every open finding into one fixer attempt and one re-review after review decide.