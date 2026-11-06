# Memory

## Context

Phase C implements the v2 structure, gates, channels, payloads, verbs, surfaces,
docs, and review policy. C001–C008 are complete; C009 implements the review-cycle
policy; C099 is the phase review.

## Progress

- pending

## Findings

- 2026-11-03 (out-of-band hardening): a v2 unfinished task whose `GATES.md`
  declares no classified stage now fails `check` with
  `gate.no-mechanical-stages`, and `claim --close` refuses with
  `claim.gate-unproven`. Complete and legacy records keep their shape.
  `scaffold` now emits a `(mechanical)` placeholder gate instead of a prose
  stage. The 13 pending execution tasks in D–I gained one mechanical package
  stage each so the store stays green.

## Open Questions

- None.

## Handoff

- See PHASE.md.

## Deviations

- None.

## Execution Brief

- Read: this brief, the task's TASK.md/GATES.md, and only the scoped source paths. Do not read other task MEMORY files, generated payloads, lockfiles, or whole review rounds; extract sections with grep/sed.
- Write scope: this task's directory plus only the files TASK.md names. Record writes go to this task's MEMORY.md.
- Gate: run each command in GATES.md once. Use scoped tests while implementing; the orchestrator runs the official gate once at completion, and repo-wide gates once per phase boundary.
- Record: MEMORY.md <= 80 lines (Context, Progress, Findings, Gates, Open Questions, Handoff, Deviations). Full logs go to /tmp/<task>.log and are referenced, never pasted.
- Review: address all findings in one batch; one fixer attempt then one re-review; call `mf-specs review decide` before dispatching.
