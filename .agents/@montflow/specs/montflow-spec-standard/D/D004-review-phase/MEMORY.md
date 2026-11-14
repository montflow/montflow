# Memory

## Context

Phase D review: profile discovery plus the lean execution contract.

## Progress

- 2026-11-03: pending, not started.

## Open Questions

- None yet.

## Handoff

- The round is the review record; this task closes only on a passing verdict.

## Deviations

- None yet.

## Execution Brief

- Read: this brief, the task's TASK.md/GATES.md, and only the scoped source paths. Do not read other task MEMORY files, generated payloads, lockfiles, or whole review rounds; extract sections with grep/sed.
- Write scope: this task's directory plus only the files TASK.md names. Record writes go to this task's MEMORY.md.
- Gate: run each command in GATES.md once. Use scoped tests while implementing; the orchestrator runs the official gate once at completion, and repo-wide gates once per phase boundary.
- Record: MEMORY.md <= 80 lines (Context, Progress, Findings, Gates, Open Questions, Handoff, Deviations). Full logs go to /tmp/<task>.log and are referenced, never pasted.
- Review: address all findings in one batch; one fixer attempt then one re-review; call `mf-specs review decide` before dispatching.
