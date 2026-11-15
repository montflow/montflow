# Memory

## Context

None yet.

## Progress

- pending

## Open Questions

- None.

## Handoff

- See PHASE.md.

## Deviations

- None.

## Execution Brief

- Read: this brief, each task TASK.md/GATES.md, and only the scoped source
  paths the tasks name: `packages/prompts/src/modules/prompts/prompts.module.ts`,
  `packages/prompts/src/modules/spec-source/`, `packages/prompts/src/tui.ts`,
  `packages/prompts/src/modules/index.ts`, `packages/profiles/prompts/`,
  `packages/profiles/payload.json`, `packages/profiles/payload.manifest.yaml`,
  the `specs` package's shipped prompt payload as the `kind: prompt` shape
  reference, and `packages/profiles/src/apps/doctor/tests/`. No broad grep over
  generated payloads, lockfiles, or other tasks.
- Write scope: `packages/prompts/src/` for A001; `packages/profiles/prompts/`,
  `packages/profiles/payload.json` for A002; `packages/prompts/src/` and
  `packages/profiles/src/` for A003 (plus each task directory). Record writes go
  to the task MEMORY.md.
- Gate: each task GATES.md — A001 runs the `profile-source`/`template-variables`
  tests and the prompts `ts:check`; A002 runs `mf-profiles doctor --check --dir
  $PWD` and `mf-prompts verify profile-runner --dir $PWD`; A003 runs the doctor
  and profile-source tests and both packages' `ts:check`. Run each once, at the
  orchestrator's task gate; repo-wide checks are not part of a task gate.
- Record: keep each worker MEMORY.md at or under 80 lines; full logs go to
  /tmp/A001.log, /tmp/A002.log, /tmp/A003.log.
- Review: review is waived for this `light` phase; batch any open findings into
  one fixer attempt and one re-review after `mf-specs review decide`.