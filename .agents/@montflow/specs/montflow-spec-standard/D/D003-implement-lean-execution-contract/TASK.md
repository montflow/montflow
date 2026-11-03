---
id: D003
name: implement-lean-execution-contract
type: execution
originator: user
size: medium
depends-on: C007, C009, D001, D002
related-tasks: D001, D002
status: pending
---

# Task D003: implement-lean-execution-contract

## Type: execution

## Description

Encode the lean execution contract that cut Phase C's token cost: a per-phase
execution brief, one gate pass, a bounded worker memory, and selective reads.
Update the shipped worker/orchestrator profiles, the execution prompt, and the
authoring skill; add a mechanical check and a drift test so the contract cannot
silently disappear.

The Phase C run paid for the same discovery twice per task: each worker
reconstructed context and ran the full gate matrix, then the orchestrator ran
the same matrix again. Records grew to 13-28 KB per task. This task makes the
cheap path the enforced path.

## Requirements

- Every v2 in-progress phase `MEMORY.md` carries an `## Execution Brief` with the
  context packet, read budget, write scope, official gate command, and record
  cap. The authoring skill generates one for every new phase; complete and
  frozen phases are exempt.
- The canonical and installed `spec-worker` and `spec-execution-orchestrator`
  profiles and `packages/specs/prompts/spec-execute.json` state: read only the
  brief plus `TASK.md`/`GATES.md` and scoped source, never broad-grep generated
  files or lockfiles, run the official gate once per task, and run the
  repo-wide gate once per phase boundary.
- A worker `MEMORY.md` is capped at 80 lines with a fixed section set; full
  command logs live in `/tmp` and are referenced, never pasted into the record.
- Review rework batches all findings into one fixer attempt and one re-review;
  the profile and prompt stop one-fixer-per-finding dispatch and call
  `mf-specs review decide` first.
- `mf-specs check` reports a `phase.execution-brief-missing` warning for a v2
  in-progress phase whose `MEMORY.md` lacks the brief, with a fixture; frozen
  and complete phases are exempt.
- A drift test fails when the lean-contract markers disappear from the canonical
  profiles/prompt or the installed copies diverge.
- Existing pending tasks (D001, D002, E-I) carry a short `## Execution`
  pointer to the phase brief; the authoring skill prevents a task from
  duplicating a command already named in its `GATES.md`.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that
brief, and the scoped source; run each gate once; keep this task's `MEMORY.md`
under 80 lines; batch review findings into one fixer attempt.

## Completion

- [ ] Every v2 in-progress phase `MEMORY.md` (C-I) carries `## Execution Brief`; `mf-specs check` is green, and the new `phase.execution-brief-missing` warning fires on a fixture without it.
- [ ] The canonical and installed `spec-worker`/`spec-execution-orchestrator` profiles and `spec-execute` prompt carry the lean markers; a drift test fails when one marker is removed in a temp copy.
- [ ] The authoring skill generates the brief for new phases, and the existing pending task records carry the `## Execution` pointer.
- [ ] The prompt and profile state one fixer attempt per review round and one re-review, keyed off `mf-specs review decide`.
- [ ] `bun run mf-specs:check`, `bun run mf-profiles:check`, `bun run mf-prompts:check`, `bun run mf:check`, and the touched package tests pass; `ts:check`, `lint:check`, and `fmt:check` pass.
- [ ] Changelog entries exist for every package whose shipped payload or skill text changed.
