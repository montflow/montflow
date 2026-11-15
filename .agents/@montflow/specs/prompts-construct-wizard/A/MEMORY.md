# Memory

## Context

The `mf-prompts` CLI (packages/prompts, binary `mf-prompts`) exposes both
`render` and `execute`, and both print the rendered prompt while `execute` also
runs the doctor gate and demands a model the binary never uses. This phase
replaces them with one `construct` command plus an interactive `--wizard`, and
removes the two legacy commands across the binary, the `/mf-prompts` slash
command, the interactive menu, docs, and tests scraps.

## Progress

- pending

## Open Questions

- None.

## Handoff

- See PHASE.md.

## Deviations

- None.

## Execution Brief

- Read: this brief, the owning task `TASK.md`/`GATES.md`, the issue-derived requirements in `SPEC.md`, and only the source paths the task `write-scope:` names — `packages/prompts/src/modules/`, `packages/prompts/src/apps/interactive/`, `packages/prompts/src/apps/cli/`, `packages/prompts/README.md`, `guides/`. The shared validation/render lives in `modules/prompts` and `modules/prompt-execute`; the existing fill loop lives in `apps/interactive/interactive.apps.module.ts`; the command tree lives in `apps/cli/binary.apps.module.ts` and `slash.apps.module.ts`.
- Write scope: the task directory plus only the files its `TASK.md` names, within the task's `write-scope:`; record writes go to the task `MEMORY.md`.
- Gate: each task proves itself through its own `GATES.md` — command runs scoped to the task's `write-scope:`; never a repo-wide suite. The three tasks share no gate command, so nothing is phase-shared; there is no phase `GATES.md`.
- Record: keep each worker `MEMORY.md` at or under 80 lines with the fixed section set; full logs go to `/tmp/<task-id>.log` and are referenced, never pasted.
- Review: A004 is the phase review; batch every open finding into one fixer attempt and one re-review after `mf-specs review decide`.
