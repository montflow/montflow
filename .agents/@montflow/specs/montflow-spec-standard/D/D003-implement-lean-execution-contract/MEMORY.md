# Memory

## Context

Implement the lean execution contract: phase execution brief, one gate pass,
80-line worker memory, selective reads, batched review rework, and a mechanical
`phase.execution-brief-missing` check plus a drift test.

## Progress

- 2026-11-03: authored; pending execution.

## Findings

- None yet.

## Open Questions

- None yet.

## Handoff

- The orchestrator has already added `## Execution Brief` to the C-I phase
  memories and `## Execution` pointers to the pending D-I tasks; this task
  owns the shipped artifacts and the mechanical check that keeps them there.

## Deviations

- None yet.

## Execution Brief

- Read: this brief, the task's TASK.md/GATES.md, and only the scoped source paths. Do not read other task MEMORY files, generated payloads, lockfiles, or whole review rounds; extract sections with grep/sed.
- Write scope: this task's directory plus only the files TASK.md names. Record writes go to this task's MEMORY.md.
- Gate: run each command in GATES.md once. Use scoped tests while implementing; the orchestrator runs the official gate once at completion, and repo-wide gates once per phase boundary.
- Record: MEMORY.md <= 80 lines (Context, Progress, Findings, Gates, Open Questions, Handoff, Deviations). Full logs go to /tmp/<task>.log and are referenced, never pasted.
- Review: address all findings in one batch; one fixer attempt then one re-review; call `mf-specs review decide` before dispatching.
