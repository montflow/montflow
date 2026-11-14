# Memory

## Context

Phase E: make parallel execution the default and add the single-flight
verification scheduler. E001 decided the contract, E002 built the scheduler,
E003 taught the authoring surfaces.

## Progress

- E001/E002/E003 complete. Their stage-3 mechanical proofs were refreshed after
  the review fixes (commit `56f003c4`); E002 runs the package suite, E003 runs
  its own drift suite.
- Phase review ran in series `montflow-spec-standard`, rounds 005–010: 22
  findings, 20 resolved. Two rounds were user-authorized overflows past the
  autonomous budget.
- The review fixed the scheduler's single-flight guarantees (F1–F4, F16, F22,
  F23), the gate freshness/scope rules (F2, F6, F7, F12, F13, F18, F20), the
  `write-scope` generators and grammar (F5, F11, F17, F21, F25), and the drift
  markers (F9). `56f003c4` closes F23's mechanism: the record append and the
  terminal state write share one runs lock, so a reader cannot observe a pass
  without its `resultIndex`. The package suite is green (2043 tests, 8
  consecutive runs).
- 2026-11-03: the owner decided to close phase E without a further review pass.
  `E099` was removed and the phase waived; the reason is recorded on the waiver
  and here. The full review trail stays in
  `.agents/@montflow/reviews/montflow-spec-standard/005`–`010`.

## Open Questions

- F26 (Minor): `create --tasks "…:scope=app,lib,docs"` is refused although
  `init` and the verifier accept a three-path scope. Carried as a defect; it
  can be fixed in a later phase without reopening E.
- F23 is fixed in code but the round still marks it `Open`; a future reviewer
  turn should confirm it before the waiver is ever revisited.

## Handoff

- E is waived, not reviewed-to-pass. Anything touching the scheduler should
  re-read rounds 005–010 rather than the waiver as evidence of quality.

## Deviations

- Phase E closed by an effective waiver with two findings open (F23 fixed in
  code, F26 open). The single-flight defect is fixed and covered by a
  regression test, but no reviewer verified the fix.

## Execution Brief

- Read: this brief, the task's TASK.md/GATES.md, and only the scoped source paths. Do not read other task MEMORY files, generated payloads, lockfiles, or whole review rounds; extract sections with grep/sed.
- Write scope: this task's directory plus only the files TASK.md names. Record writes go to this task's MEMORY.md.
- Gate: run each command in GATES.md once. Use scoped tests while implementing; the orchestrator runs the official gate once at completion, and repo-wide gates once per phase boundary.
- Record: MEMORY.md <= 80 lines (Context, Progress, Findings, Gates, Open Questions, Handoff, Deviations). Full logs go to /tmp/<task>.log and are referenced, never pasted.
- Review: address all findings in one batch; one fixer attempt then one re-review; call `mf-specs review decide` before dispatching.
