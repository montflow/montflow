# Memory

## Context

Implement the lean execution contract: phase execution brief, one gate pass,
80-line worker memory, selective reads, batched review rework, a mechanical
`phase.execution-brief-missing` warning, and a drift test.

## Progress

- 2026-11-03: added `phase.execution-brief-missing` (warning) to
  `structure.module.ts`; a v2 `in-progress` phase whose `MEMORY.md` lacks
  `## Execution Brief` warns. Complete and v1/frozen phases are exempt.
- Canonical + installed `spec-worker`/`spec-execution-orchestrator` profiles,
  `spec-execute` prompt, and `montflow-create-specs` skill state the lean
  markers (brief-only read, no broad grep over generated payloads/lockfiles,
  80-line memory with `/tmp` logs, official gate once per task, repo-wide gate
  once per phase boundary, one batched fixer + one re-review after
  `mf-specs review decide`).
- Tests: `structure/tests/verify-spec-tree.test.ts` (pure warning/exemption
  cases), `apps/cli/tests/check-execution-brief.test.ts` (real `init` fixture),
  `prompt/tests/lean-contract.test.ts` (markers, installed-copy bytes, temp-copy
  mutation).
- Regenerated both embedded payloads and ran scoped `mf-*` doctor; changelogs
  updated in `packages/profiles`, `packages/specs`, and the skill.

## Findings

- `doctor` repair also synced unrelated installed payloads left stale by
  in-flight sibling work (`.agents/skills/*`, `.agents/@montflow/prompts/`
  `spec-create.json`). I left those repairs in place; they are not this task's
  edits and the phase gate needs them.
- Store confirmation: phases C-I carry `## Execution Brief`; A/B are complete
  (exempt). Every `pending` task (D004, E-I) carries `## Execution`.

## Gates

Full logs: `/tmp/D003.log`; drift-failure log `/tmp/D003-drift-fail.log`.

- `bun run --cwd packages/specs test`: 136 files, 1851 tests, exit 0
- `bun run --cwd packages/profiles test`: 42 files, 202 tests, exit 0
- `ts:check`, `lint:check`, `format:check` on both packages: exit 0
- `mf-specs check --name montflow-spec-standard`: 0 issues, exit 0
- `mf-specs doctor --check`, `mf-profiles verify` (2), `mf-profiles doctor
  --check`, `mf-prompts verify spec-execute`, `mf-skills verify
  montflow-create-specs`: exit 0

## Open Questions

- None.

## Handoff

- Orchestrator: run GATES.md once (stage 0-4) plus the repo-wide `mf:check`;
  the store's `mf-specs check` and payload doctor are already green here.
- The drift test reads `.agents/` mirrors, so it fails if the workspace is not
  doctor-synced; CI ships them committed.

## Deviations

- Did not edit `TASK.md` completion boxes, statuses, `PHASE.md`, or any gate
  result; `mf-specs claim` owns them.
- The worker `MEMORY.md` 80-line cap is stated in the profiles/prompt/skill but
  has no separate mechanical length check; only the brief-presence rule is
  verifier-backed, as TASK.md requires.

## Execution Brief

- Read: this brief, the task's TASK.md/GATES.md, and only the scoped source paths. Do not read other task MEMORY files, generated payloads, lockfiles, or whole review rounds; extract sections with grep/sed.
- Write scope: this task's directory plus only the files TASK.md names. Record writes go to this task's MEMORY.md.
- Gate: run each command in GATES.md once. Use scoped tests while implementing; the orchestrator runs the official gate once at completion, and repo-wide gates once per phase boundary.
- Record: MEMORY.md <= 80 lines (Context, Progress, Findings, Gates, Open Questions, Handoff, Deviations). Full logs go to /tmp/<task>.log and are referenced, never pasted.
- Review: address all findings in one batch; one fixer attempt then one re-review; call `mf-specs review decide` before dispatching.
