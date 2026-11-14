# Memory
## Context
- Task J002 (spec montflow-spec-standard, phase J): schema + resolve/status surfaces for J001 decision.
- J001 decision (inline, not re-grepped): `verification: light|full` beside `model`/`effort` in `SizeEntry`, `VERIFICATIONS=['light','full']`, `DEFAULT_VERIFICATION='light'`, `CODES.malformedVerification='sizing.malformed-verification'` (expected `light, full`, fix `Set <field>.verification to "light" or "full"`), `verification` without `model` via existing `missing-model`, whole-entry merge, `resolve()` returns required `verification`, `sizing --task` appends mode, `resolve` stdout bare with `--json`, `status`/`next` append per ready line.
## Progress
- Bound only J002 via `claim --name montflow-spec-standard --task J002` (no status change).
- `packages/specs/src/modules/sizing/sizing.module.ts`: added `VERIFICATIONS`/`Verification`/`DEFAULT_VERIFICATION`/`VERIFICATION_HINT`, `CODES.malformedVerification`, `SizeEntry.verification?: Verification`, `SizeEntrySchema.verification`, `issueFromFault` verification arms for `sizes.*` and `phases.*.sizes.*` (expected `light, full`), unknown-key expected → `model, effort, or verification`, `Resolved.verification: Verification` (required), `resolve()` defaults `entry.verification ?? DEFAULT` and `inherit → light`.
- `packages/specs/src/apps/cli/cli.sizing.module.ts`: `TaskTarget.verification: Verification` (required), `taskTarget()` propagates `Resolved.verification` (undefined size → `light`), `targetColumns()` appends `  <verification>` (covers `status` task lines + `next` ready lines), `renderSizing()` compact appends `  <verification>`, `renderSizingReport()` head appends ` · verification <mode>`, `resolveCommand` adds `--json` (`{size,target,source?,verification}`) while stdout stays bare `target` otherwise.
- Tests pinned in colocated `src/modules/sizing`: `resolve.test.ts` (default light, inherit light, whole-entry `full→light` phase-wins, merge unchanged), `verify-config.test.ts` (accept `light`/`full` top-level + phase, malformed → `sizing.malformed-verification` both levels, verification-only → `missing-model`), `parse-config.test.ts` (parse keeps `verification`, absent stays absent, resolve defaults, malformed parse codes). Also updated exact-string expectations in `src/apps/cli/tests/sizing.test.ts` and `src/apps/cli/tests/fixtures.test.ts` for the appended mode.
## Findings
- Whole-entry merge already guaranteed by `mergedEntry`/`merge`: a phase entry without `verification` wins wholesale and resolves to `light`, never inheriting `full` from repo/spec.
- `verification`-only entry (`{verification:"full"}`) is rejected by the pre-existing required-`model` `missing-model` fault; no new semantic code needed, so no `verificationWithoutModel` was invented.
- Bare `resolve` stdout unchanged (`provider/model#effort` / `inherit`); the mode is carried in `--json` and in `sizing`/`status`/`next` surfaces, per the inline contract. Slash `resolve` arm still prints bare target (no `--json` flag added to slash parsing); slash `sizing` inherits the compact append via `renderSizingMode`.
- `status` phase `sizes` summary line still shows targets only (mode lives on task / ready lines via `targetColumns`); reviewer must judge whether that summary should also carry the mode.
- Gate proof untouched: `light` is additive metadata only; task-local mechanical stage selection and `gated` marking in `renderNext` are unchanged. Actual skipping of repo-wide + review stages is not implemented here (J003/J004 scope); reviewer must judge that the schema+surfaces leave the gate path intact.
## Gates
- Scoped proof only (orchestrator runs GATES.md): `bun run --cwd packages/specs test -- src/modules/sizing` → exit 0, `Test Files 8 passed (8)`, `Tests 100 passed (100)`, `Type Errors no errors`. Full output in `/tmp/J002.log` (contains one initial fixture `actual: "number" vs "42"` miss plus the final passing run).
- GATES.md Stages 0–1 left to orchestrator. Stage 2 mechanical command is the same scoped suite above; the orchestrator re-runs it once at completion. `check --name montflow-spec-standard` not run (orchestrator's stage).
## Open Questions
- Reviewer to judge: compact token `  light` (same column style as source) and head token ` · verification light` — style-only, no downstream contract.
- Reviewer to judge `resolve --json` `size: "none"` for `size: none` complete tasks; pending/valid tasks always carry a real size.
## Handoff
- J003/J004 can consume `Resolved.verification` / `TaskTarget.verification` directly; defaults already resolved, no caller re-derives `?? DEFAULT`.
- Next: orchestrator gate run, then J003 wiring.
## Deviations
- No new diagnosis invented; unexpected flag surfaces noted above are format choices, not semantics. Test files outside `src/modules/sizing` were touched only to update exact resolve/render strings for the new required field.
